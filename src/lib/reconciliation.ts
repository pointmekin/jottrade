import {
	type CashFlow,
	closedTradesInRange,
	summarizeGroups,
	summarizeTrades,
	type TradeRecord,
} from "./analytics";
import { priceReturnPercent } from "./finance";

export type ReconcileTrade = TradeRecord & {
	setupId: number | null;
	side: string;
	entryPrice: number | null;
	exitPrice: number | null;
	returnPercent: number | null;
};

/** Totals read straight from SQL, the same way `getStrategyPerformance` reads them. */
export type SqlTotals = {
	strategies: { setupId: number | null; count: number; pnl: number }[];
	cashFlowTotal: number;
};

export const ReconcileCheck = {
	HeadlineCount: "headline-count",
	HeadlineBalance: "headline-balance",
	StrategyCount: "strategy-count",
	StrategyPnl: "strategy-pnl",
} as const;

export type ReconcileCheck =
	(typeof ReconcileCheck)[keyof typeof ReconcileCheck];

export type Discrepancy = { check: ReconcileCheck; detail: string };

const CENT = 0.01;

function differs(a: number, b: number): boolean {
	return Math.abs(a - b) > CENT / 2;
}

/**
 * Compares, for one account, the dashboard headline and the dashboard strategy
 * chart with totals from SQL. Every screen reads all time here, so every total
 * must match. `legacyReturnRows` counts closed trades whose stored return is
 * not the price return.
 */
export function reconcileAccount(
	trades: ReconcileTrade[],
	cashFlows: CashFlow[],
	sql: SqlTotals,
): {
	closedTrades: number;
	discrepancies: Discrepancy[];
	legacyReturnRows: number;
} {
	const discrepancies: Discrepancy[] = [];
	const report = (check: ReconcileCheck, detail: string) =>
		discrepancies.push({ check, detail });

	const { stats } = summarizeTrades(trades, cashFlows);
	const sqlCount = sql.strategies.reduce((a, s) => a + s.count, 0);
	const sqlPnl = sql.strategies.reduce((a, s) => a + s.pnl, 0);

	if (stats.totalTrades !== sqlCount)
		report(
			ReconcileCheck.HeadlineCount,
			`headline ${stats.totalTrades}, SQL ${sqlCount}`,
		);
	if (differs(stats.totalBalance, sqlPnl + sql.cashFlowTotal))
		report(
			ReconcileCheck.HeadlineBalance,
			`headline ${stats.totalBalance}, SQL ${sqlPnl + sql.cashFlowTotal}`,
		);

	const closed = closedTradesInRange(trades);
	const chart = summarizeGroups(
		closed,
		(t) => t.setupId,
		(t) => t.netPnl,
	);
	const setupIds = new Set([
		...chart.keys(),
		...sql.strategies.map((s) => s.setupId),
	]);
	for (const setupId of setupIds) {
		const group = chart.get(setupId);
		const row = sql.strategies.find((s) => s.setupId === setupId);
		const count = { chart: group?.count ?? 0, sql: row?.count ?? 0 };
		const pnl = { chart: group?.totalPnl ?? 0, sql: row?.pnl ?? 0 };
		if (count.chart !== count.sql)
			report(
				ReconcileCheck.StrategyCount,
				`strategy ${setupId}: chart ${count.chart}, SQL ${count.sql}`,
			);
		if (differs(pnl.chart, pnl.sql))
			report(
				ReconcileCheck.StrategyPnl,
				`strategy ${setupId}: chart ${pnl.chart}, SQL ${pnl.sql}`,
			);
	}

	const legacyReturnRows = closed.filter((t) => {
		if (t.entryPrice === null || t.exitPrice === null) return false;
		const expected = priceReturnPercent(
			t.side === "SHORT" ? "SHORT" : "LONG",
			t.entryPrice,
			t.exitPrice,
		);
		if (expected === null) return false;
		return t.returnPercent === null || differs(t.returnPercent, expected);
	}).length;

	return { closedTrades: closed.length, discrepancies, legacyReturnRows };
}
