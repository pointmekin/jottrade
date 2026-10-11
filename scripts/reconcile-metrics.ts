/**
 * Read-only check that every metrics screen agrees with the database.
 *
 *   DATABASE_URL=... bunx tsx scripts/reconcile-metrics.ts
 *
 * It does not read `.env`, so the target database is always explicit. All
 * queries run in one READ ONLY transaction. The output has account ids and
 * counts only. The exit code is 1 when any account has a discrepancy.
 */
import pg from "pg";
import { toRealizations } from "../src/lib/position";
import { reconcileAccount, type SqlTotals } from "../src/lib/reconciliation";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("Set DATABASE_URL to the database to check.");
	process.exit(2);
}

const toNumber = (value: string | null) =>
	value === null ? null : Number(value);

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
	await client.query("BEGIN READ ONLY");
	const queries = [
		`SELECT id, portfolio_id, status, entry_date, exit_date, net_pnl, setup_id,
			        side, entry_price, exit_price, return_percent, execution_count
			   FROM trades`,
		"SELECT portfolio_id, occurred_at, amount, kind FROM cash_flows",
		`SELECT portfolio_id, setup_id, COUNT(*)::int AS count,
			        COALESCE(SUM(net_pnl), 0) AS pnl
			   FROM trades WHERE status = 'CLOSED'
			  GROUP BY portfolio_id, setup_id`,
		`SELECT portfolio_id, COALESCE(SUM(amount), 0) AS total
		   FROM cash_flows GROUP BY portfolio_id`,
		`SELECT trade_id, executed_at, realized_pnl FROM trade_executions
		  WHERE kind = 'exit' ORDER BY executed_at, sequence`,
		`SELECT t.portfolio_id, t.id, t.status, t.net_pnl, t.execution_count,
		        COUNT(e.id)::int AS fill_count,
		        COALESCE(SUM(e.realized_pnl) FILTER (WHERE e.kind = 'exit'), 0) AS exit_pnl
		   FROM trades t LEFT JOIN trade_executions e ON e.trade_id = t.id
		  WHERE t.execution_count > 0
		  GROUP BY t.id`,
	];
	const results = [];
	for (const query of queries) results.push(await client.query(query));
	const [trades, flows, strategyTotals, flowTotals, exits, positions] = results;
	await client.query("ROLLBACK");

	const exitsByTrade = new Map<
		number,
		{ executedAt: Date; realizedPnl: string | null }[]
	>();
	for (const exit of exits.rows)
		exitsByTrade.set(exit.trade_id, [
			...(exitsByTrade.get(exit.trade_id) ?? []),
			{ executedAt: exit.executed_at, realizedPnl: exit.realized_pnl },
		]);
	const realizationsOf = (row: (typeof trades.rows)[number]) => {
		if (row.execution_count === 0) return undefined;
		const closedPnl = row.status === "CLOSED" ? toNumber(row.net_pnl) : null;
		return toRealizations(exitsByTrade.get(row.id) ?? [], closedPnl);
	};

	const accountIds = new Set<number>([
		...trades.rows.map((row) => row.portfolio_id),
		...flows.rows.map((row) => row.portfolio_id),
	]);

	let failing = 0;
	let legacyTotal = 0;
	let positionTotal = 0;
	let positionMatching = 0;
	for (const id of [...accountIds].sort((a, b) => a - b)) {
		const sql: SqlTotals = {
			strategies: strategyTotals.rows
				.filter((row) => row.portfolio_id === id)
				.map((row) => ({
					setupId: row.setup_id,
					count: row.count,
					pnl: Number(row.pnl),
				})),
			cashFlowTotal: Number(
				flowTotals.rows.find((row) => row.portfolio_id === id)?.total ?? 0,
			),
			positions: positions.rows
				.filter((row) => row.portfolio_id === id)
				.map((row) => ({
					tradeId: row.id,
					status: row.status,
					netPnl: toNumber(row.net_pnl),
					executionCount: row.execution_count,
					fillCount: row.fill_count,
					exitPnl: Number(row.exit_pnl),
				})),
		};
		const result = reconcileAccount(
			trades.rows
				.filter((row) => row.portfolio_id === id)
				.map((row) => ({
					status: row.status,
					entryDate: row.entry_date,
					exitDate: row.exit_date,
					netPnl: Number(row.net_pnl ?? 0),
					setupId: row.setup_id,
					side: row.side,
					entryPrice: toNumber(row.entry_price),
					exitPrice: toNumber(row.exit_price),
					returnPercent: toNumber(row.return_percent),
					realizations: realizationsOf(row),
				})),
			flows.rows
				.filter((row) => row.portfolio_id === id)
				.map((row) => ({
					occurredAt: row.occurred_at,
					amount: Number(row.amount),
					kind: row.kind,
				})),
			sql,
		);

		if (result.discrepancies.length > 0) failing++;
		legacyTotal += result.legacyReturnRows;
		positionTotal += result.positions.total;
		positionMatching += result.positions.matching;
		console.log(
			`account ${id}: ${result.closedTrades} closed trades, ${result.discrepancies.length} discrepancies, ${result.legacyReturnRows} legacy return rows`,
		);
		for (const { check, detail } of result.discrepancies) {
			console.log(`  ${check}: ${detail}`);
		}
	}

	console.log(
		`${accountIds.size} accounts, ${failing} with discrepancies, ${legacyTotal} legacy return rows`,
	);
	console.log(
		`${positionMatching} of ${positionTotal} positions with fills match their stored totals`,
	);
	process.exitCode = failing > 0 ? 1 : 0;
} finally {
	await client.end();
}
