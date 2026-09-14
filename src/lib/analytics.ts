import { previousDayKey, toDayKey } from "./date";

export type ClosedTrade = {
	exitDate: Date;
	entryDate: Date;
	netPnl: number;
};

/** A deposit (positive) or a withdrawal (negative). */
export type CashFlow = {
	occurredAt: Date;
	amount: number;
};

/** A reporting window. `null` on a side means unbounded. */
export type DateRange = {
	from: Date | null;
	to: Date | null;
};

export const TradeStatus = {
	Open: "OPEN",
	Closed: "CLOSED",
	Pending: "PENDING",
} as const;

export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];

export type TradeRecord = {
	status: string | null;
	entryDate: Date;
	exitDate: Date | null;
	netPnl: number;
};

export type EquityPoint = { date: string; balance: number };

export type TradeStats = {
	/** Balance carried into the window: earlier deposits plus earlier realized P&L. */
	openingBalance: number;
	/** Deposits minus withdrawals inside the window. */
	netDeposits: number;
	totalBalance: number;
	totalPnL: number;
	activeTrades: number;
	winRate: number;
	/** null when there is no losing trade to divide by. */
	profitFactor: number | null;
	totalTrades: number;
	winningTrades: number;
	losingTrades: number;
	breakevenTrades: number;
};

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

const UNBOUNDED: DateRange = { from: null, to: null };

function isBefore(date: Date, from: Date | null): boolean {
	return from !== null && date.getTime() < from.getTime();
}

function isAfter(date: Date, to: Date | null): boolean {
	return to !== null && date.getTime() > to.getTime();
}

/** A closed trade is realized on its exit date; fall back to entry when exit is missing. */
function realizedAt(trade: TradeRecord): Date {
	return trade.exitDate ?? trade.entryDate;
}

/**
 * Realized P&L, win/loss counts, and a daily equity curve for one window.
 *
 * The curve starts from the balance carried into the window, and steps with both
 * realized P&L and cash flows. A deposit therefore raises the line without
 * counting as a profit.
 *
 * Only CLOSED trades count as realized; PENDING trades belong to neither bucket.
 * Breakeven trades stay out of the win rate denominator, so a scratch trade does
 * not read as a loss.
 */
export function summarizeTrades(
	records: TradeRecord[],
	cashFlows: CashFlow[] = [],
	range: DateRange = UNBOUNDED,
	timeZone = "UTC",
): { stats: TradeStats; equityCurve: EquityPoint[] } {
	const { from, to } = range;

	let openingBalance = 0;
	let netDeposits = 0;
	const dailyFlow = new Map<string, number>();

	for (const flow of cashFlows) {
		const amount = Number.isFinite(flow.amount) ? flow.amount : 0;
		if (isAfter(flow.occurredAt, to)) continue;
		if (isBefore(flow.occurredAt, from)) {
			openingBalance += amount;
			continue;
		}
		netDeposits += amount;
		const day = toDayKey(flow.occurredAt, timeZone);
		dailyFlow.set(day, (dailyFlow.get(day) ?? 0) + amount);
	}

	let totalPnL = 0;
	let grossProfit = 0;
	let grossLoss = 0;
	let winningTrades = 0;
	let losingTrades = 0;
	let breakevenTrades = 0;
	let closedInRange = 0;
	const dailyPnl = new Map<string, number>();

	for (const trade of records) {
		if (trade.status !== TradeStatus.Closed) continue;

		const at = realizedAt(trade);
		const pnl = Number.isFinite(trade.netPnl) ? trade.netPnl : 0;

		if (isAfter(at, to)) continue;
		if (isBefore(at, from)) {
			openingBalance += pnl;
			continue;
		}

		closedInRange++;
		totalPnL += pnl;

		if (pnl > 0) {
			winningTrades++;
			grossProfit += pnl;
		} else if (pnl < 0) {
			losingTrades++;
			grossLoss += Math.abs(pnl);
		} else {
			breakevenTrades++;
		}

		const day = toDayKey(at, timeZone);
		dailyPnl.set(day, (dailyPnl.get(day) ?? 0) + pnl);
	}

	// An open position entered after the window has not been taken yet.
	const activeTrades = records.filter(
		(trade) =>
			trade.status === TradeStatus.Open && !isAfter(trade.entryDate, to),
	).length;

	const days = Array.from(
		new Set([...dailyPnl.keys(), ...dailyFlow.keys()]),
	).sort();

	const equityCurve: EquityPoint[] = [];
	let balance = openingBalance;

	if (days.length > 0) {
		equityCurve.push({
			date: previousDayKey(days[0]),
			balance: round2(openingBalance),
		});
	}

	for (const day of days) {
		balance += (dailyPnl.get(day) ?? 0) + (dailyFlow.get(day) ?? 0);
		equityCurve.push({ date: day, balance: round2(balance) });
	}

	const decidedTrades = winningTrades + losingTrades;

	return {
		stats: {
			openingBalance: round2(openingBalance),
			netDeposits: round2(netDeposits),
			totalBalance: round2(balance),
			totalPnL: round2(totalPnL),
			activeTrades,
			winRate: decidedTrades > 0 ? (winningTrades / decidedTrades) * 100 : 0,
			profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
			totalTrades: closedInRange,
			winningTrades,
			losingTrades,
			breakevenTrades,
		},
		equityCurve,
	};
}

/**
 * Groups closed trades by local exit date. Returns date → sum of netPnl.
 */
export function groupByDay(
	trades: ClosedTrade[],
	timeZone = "UTC",
): Map<string, number> {
	const map = new Map<string, number>();
	for (const trade of trades) {
		const key = toDayKey(trade.exitDate, timeZone);
		map.set(key, (map.get(key) ?? 0) + trade.netPnl);
	}
	return map;
}

/**
 * Annualized Sharpe ratio from a series of P&L values.
 * Risk-free rate = 0. Annualization = sqrt(252).
 * Uses sample stddev (n-1). Returns 0 if fewer than 2 values or stddev is 0.
 */
export function computeSharpe(dailyPnl: Map<string, number>): number {
	const values = Array.from(dailyPnl.values());
	if (values.length < 2) return 0;
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	// Use sample stddev (n-1) — required for unbiased Sharpe ratio estimation
	const variance =
		values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
	const stddev = Math.sqrt(variance);
	if (stddev === 0) return 0;
	return (mean / stddev) * Math.sqrt(252);
}

/**
 * Largest peak-to-trough drawdown of the account value.
 *
 * It reads the equity curve rather than raw P&L, so deposits and withdrawals
 * move the peak the same way the real account does.
 * IMPORTANT: points must be sorted by date ascending.
 */
export function computeMaxDrawdown(curve: EquityPoint[]): {
	dollars: number;
	percent: number;
} {
	if (!curve.length) return { dollars: 0, percent: 0 };

	let peak = curve[0].balance;
	let maxDd = 0;
	let maxDdPct = 0;

	for (const point of curve) {
		if (point.balance > peak) peak = point.balance;
		const dd = peak - point.balance;
		const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
		if (dd > maxDd) {
			maxDd = dd;
			maxDdPct = ddPct;
		}
	}

	return { dollars: maxDd, percent: maxDdPct };
}

/** Avg win / |avg loss| across closed trades. Returns 0 if no wins or no losses. */
export function computeAvgRR(trades: ClosedTrade[]): number {
	const wins = trades.filter((t) => t.netPnl > 0);
	const losses = trades.filter((t) => t.netPnl < 0);
	if (!wins.length || !losses.length) return 0;
	const avgWin = wins.reduce((a, t) => a + t.netPnl, 0) / wins.length;
	const avgLoss = Math.abs(
		losses.reduce((a, t) => a + t.netPnl, 0) / losses.length,
	);
	return avgLoss === 0 ? 0 : avgWin / avgLoss;
}

/** Mean hold duration in hours across closed trades. */
export function computeAvgHoldTime(trades: ClosedTrade[]): number {
	if (!trades.length) return 0;
	const totalHours = trades.reduce(
		(acc, t) =>
			acc + (t.exitDate.getTime() - t.entryDate.getTime()) / 3_600_000,
		0,
	);
	return totalHours / trades.length;
}
