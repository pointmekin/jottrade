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
		`SELECT portfolio_id, status, entry_date, exit_date, net_pnl, setup_id,
			        side, entry_price, exit_price, return_percent
			   FROM trades`,
		"SELECT portfolio_id, occurred_at, amount, kind FROM cash_flows",
		`SELECT portfolio_id, setup_id, COUNT(*)::int AS count,
			        COALESCE(SUM(net_pnl), 0) AS pnl
			   FROM trades WHERE status = 'CLOSED'
			  GROUP BY portfolio_id, setup_id`,
		`SELECT portfolio_id, COALESCE(SUM(amount), 0) AS total
		   FROM cash_flows GROUP BY portfolio_id`,
	];
	const results = [];
	for (const query of queries) results.push(await client.query(query));
	const [trades, flows, strategyTotals, flowTotals] = results;
	await client.query("ROLLBACK");

	const accountIds = new Set<number>([
		...trades.rows.map((row) => row.portfolio_id),
		...flows.rows.map((row) => row.portfolio_id),
	]);

	let failing = 0;
	let legacyTotal = 0;
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
	process.exitCode = failing > 0 ? 1 : 0;
} finally {
	await client.end();
}
