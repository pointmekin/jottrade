import {
	type CashFlow,
	closedTradesInRange,
	summarizeTrades,
	type TradeRecord,
} from "./analytics";
import { priceReturnPercent } from "./finance";
import { summarizeGroups } from "./group-summary";
import { type TradeSide, TradeStatus } from "./trade";

export type ReconcileTrade = TradeRecord & {
	setupId: number | null;
	side: TradeSide;
	entryPrice: number | null;
	exitPrice: number | null;
	returnPercent: number | null;
};

/** One trade with fills: its stored totals and the sums of its fill rows. */
export type SqlPosition = {
	tradeId: number;
	status: string | null;
	netPnl: number | null;
	executionCount: number;
	fillCount: number;
	exitPnl: number;
};

/** Read straight from SQL, the way `getStrategyPerformance` reads them. */
export type SqlTotals = {
	strategies: { setupId: number | null; count: number; pnl: number }[];
	cashFlowTotal: number;
	positions: SqlPosition[];
};

export const ReconcileCheck = {
	HeadlineCount: "headline-count",
	HeadlineBalance: "headline-balance",
	StrategyCount: "strategy-count",
	StrategyPnl: "strategy-pnl",
	PositionFills: "position-fills",
} as const;

export type ReconcileCheck =
	(typeof ReconcileCheck)[keyof typeof ReconcileCheck];

export type Discrepancy = { check: ReconcileCheck; detail: string };

const CENT = 0.01;

function differs(a: number, b: number): boolean {
	return Math.abs(a - b) > CENT / 2;
}

function headlineDiscrepancies(
	trades: ReconcileTrade[],
	cashFlows: CashFlow[],
	sql: SqlTotals,
): Discrepancy[] {
	const { stats } = summarizeTrades(trades, cashFlows);
	const sqlCount = sql.strategies.reduce((a, s) => a + s.count, 0);
	const openPartialPnl = sql.positions
		.filter((position) => position.status !== TradeStatus.Closed)
		.reduce((a, position) => a + position.exitPnl, 0);
	const sqlBalance =
		sql.strategies.reduce((a, s) => a + s.pnl, 0) +
		sql.cashFlowTotal +
		openPartialPnl;
	const found: Discrepancy[] = [];
	if (stats.totalTrades !== sqlCount) {
		found.push({
			check: ReconcileCheck.HeadlineCount,
			detail: `headline ${stats.totalTrades}, SQL ${sqlCount}`,
		});
	}
	if (differs(stats.totalBalance, sqlBalance)) {
		found.push({
			check: ReconcileCheck.HeadlineBalance,
			detail: `headline ${stats.totalBalance}, SQL ${sqlBalance}`,
		});
	}
	return found;
}

function strategyDiscrepancies(
	closed: ReconcileTrade[],
	sql: SqlTotals,
): Discrepancy[] {
	const chart = summarizeGroups(
		closed,
		(t) => t.setupId,
		(t) => t.netPnl,
	);
	const sqlGroups = new Map(sql.strategies.map((row) => [row.setupId, row]));
	const setupIds = new Set([...chart.keys(), ...sqlGroups.keys()]);
	const found: Discrepancy[] = [];
	for (const setupId of setupIds) {
		const count = {
			chart: chart.get(setupId)?.count ?? 0,
			sql: sqlGroups.get(setupId)?.count ?? 0,
		};
		const pnl = {
			chart: chart.get(setupId)?.totalPnl ?? 0,
			sql: sqlGroups.get(setupId)?.pnl ?? 0,
		};
		if (count.chart !== count.sql) {
			found.push({
				check: ReconcileCheck.StrategyCount,
				detail: `strategy ${setupId}: chart ${count.chart}, SQL ${count.sql}`,
			});
		}
		if (differs(pnl.chart, pnl.sql)) {
			found.push({
				check: ReconcileCheck.StrategyPnl,
				detail: `strategy ${setupId}: chart ${pnl.chart}, SQL ${pnl.sql}`,
			});
		}
	}
	return found;
}

/** Each exit P&L is rounded to the cent, so the sum can drift by up to half a cent per fill. */
function positionMatchesFills(position: SqlPosition): boolean {
	if (position.fillCount !== position.executionCount) return false;
	if (position.status !== TradeStatus.Closed) return position.netPnl === null;
	return (
		position.netPnl !== null &&
		Math.abs(position.exitPnl - position.netPnl) <=
			(CENT / 2) * position.fillCount
	);
}

function storesNotionalReturn(trade: ReconcileTrade): boolean {
	if (trade.entryPrice === null || trade.exitPrice === null) return false;
	const expected = priceReturnPercent(
		trade.side,
		trade.entryPrice,
		trade.exitPrice,
	);
	if (expected === null) return false;
	return trade.returnPercent === null || differs(trade.returnPercent, expected);
}

/**
 * Every screen reads all time here, so every total must match SQL.
 * `legacyReturnRows` counts closed trades whose stored return is not the price return.
 * `positions` counts the trades with fills whose fill rows match the stored totals.
 */
export function reconcileAccount(
	trades: ReconcileTrade[],
	cashFlows: CashFlow[],
	sql: SqlTotals,
) {
	const closed = closedTradesInRange(trades);
	const unmatched = sql.positions.filter(
		(position) => !positionMatchesFills(position),
	);
	return {
		closedTrades: closed.length,
		positions: {
			total: sql.positions.length,
			matching: sql.positions.length - unmatched.length,
		},
		discrepancies: [
			...headlineDiscrepancies(trades, cashFlows, sql),
			...strategyDiscrepancies(closed, sql),
			...unmatched.map((position) => ({
				check: ReconcileCheck.PositionFills,
				detail: `trade ${position.tradeId}: ${position.fillCount} of ${position.executionCount} fills, exit P&L ${position.exitPnl}, stored ${position.netPnl}`,
			})),
		],
		legacyReturnRows: closed.filter(storesNotionalReturn).length,
	};
}
