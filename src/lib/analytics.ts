import { isWeekdayKey, nextDayKey, previousDayKey, toDayKey } from "./date";

export type ClosedTrade = {
	exitDate: Date;
	entryDate: Date;
	netPnl: number;
};

/** A deposit (positive) or a withdrawal (negative). */
export type CashFlow = {
	occurredAt: Date;
	amount: number;
	kind?: string;
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

/**
 * One day of the account. `balance` is cash: it moves with trades, adjustments,
 * deposits and withdrawals. `performance` is trading P&L accumulated since the
 * window opened: it ignores deposits and withdrawals.
 */
export type EquityPoint = {
	date: string;
	balance: number;
	performance: number;
};

export type TradeStats = {
	/** Balance carried into the window: earlier deposits plus earlier realized P&L. */
	openingBalance: number;
	/** Deposits minus withdrawals inside the window. */
	netDeposits: number;
	totalBalance: number;
	totalPnL: number;
	activeTrades: number;
	/** null when no trade was a win or a loss. */
	winRate: number | null;
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

/** Wins over decided trades. Breakeven trades are neither, so they stay out. */
function winRateOf(wins: number, losses: number): number | null {
	const decided = wins + losses;
	return decided > 0 ? (wins / decided) * 100 : null;
}

/** A closed trade is realized on its exit date; fall back to entry when exit is missing. */
function realizedAt(trade: TradeRecord): Date {
	return trade.exitDate ?? trade.entryDate;
}

/** The closed trades whose realization falls inside the window. */
export function closedTradesInRange<T extends TradeRecord>(
	records: T[],
	range: DateRange = UNBOUNDED,
): T[] {
	return records.filter((trade) => {
		if (trade.status !== TradeStatus.Closed) return false;
		const at = realizedAt(trade);
		return !isBefore(at, range.from) && !isAfter(at, range.to);
	});
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
	const dailyAdjustment = new Map<string, number>();
	let adjustmentPnl = 0;

	for (const flow of cashFlows) {
		const amount = Number.isFinite(flow.amount) ? flow.amount : 0;
		if (isAfter(flow.occurredAt, to)) continue;
		if (isBefore(flow.occurredAt, from)) {
			openingBalance += amount;
			continue;
		}
		const day = toDayKey(flow.occurredAt, timeZone);
		if (flow.kind === "ADJUSTMENT") {
			adjustmentPnl += amount;
			dailyAdjustment.set(day, (dailyAdjustment.get(day) ?? 0) + amount);
		} else {
			netDeposits += amount;
			dailyFlow.set(day, (dailyFlow.get(day) ?? 0) + amount);
		}
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
	totalPnL += adjustmentPnl;

	// An open position entered after the window has not been taken yet.
	const activeTrades = records.filter(
		(trade) =>
			trade.status === TradeStatus.Open && !isAfter(trade.entryDate, to),
	).length;

	const days = Array.from(
		new Set([
			...dailyPnl.keys(),
			...dailyFlow.keys(),
			...dailyAdjustment.keys(),
		]),
	).sort();

	const equityCurve: EquityPoint[] = [];
	let balance = openingBalance;
	let performance = 0;

	if (days.length > 0) {
		equityCurve.push({
			date: previousDayKey(days[0]),
			balance: round2(openingBalance),
			performance: 0,
		});
	}

	for (const day of days) {
		const tradingPnl =
			(dailyPnl.get(day) ?? 0) + (dailyAdjustment.get(day) ?? 0);
		performance += tradingPnl;
		balance += tradingPnl + (dailyFlow.get(day) ?? 0);
		equityCurve.push({
			date: day,
			balance: round2(balance),
			performance: round2(performance),
		});
	}

	return {
		stats: {
			openingBalance: round2(openingBalance),
			netDeposits: round2(netDeposits),
			totalBalance: round2(balance),
			totalPnL: round2(totalPnL),
			activeTrades,
			winRate: winRateOf(winningTrades, losingTrades),
			profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
			totalTrades: closedInRange,
			winningTrades,
			losingTrades,
			breakevenTrades,
		},
		equityCurve,
	};
}

/** Below this many eligible days a Sharpe ratio is noise, so it is not shown. */
export const MIN_SHARPE_DAYS = 20;

export type SharpeResult = { value: number | null; days: number };

/**
 * Annualized Sharpe ratio of daily account returns on realized P&L.
 *
 * A day's return is its trading P&L over the capital at the start of that day:
 * the previous balance plus the same day's deposits and withdrawals. Idle
 * weekdays between active days count as zero returns; a day without positive
 * capital has no defined return and is skipped. Risk-free rate is 0, the
 * standard deviation is the sample (n-1) one, and annualization is √252.
 * `endDay` is the last day of the window: idle weekdays after the last point
 * up to it are zero returns too.
 * IMPORTANT: points must be sorted by date ascending.
 */
export function computeSharpe(
	curve: EquityPoint[],
	endDay?: string,
): SharpeResult {
	const returns: number[] = [];
	const pushIdleWeekdays = (after: string, before: string) => {
		for (let day = nextDayKey(after); day < before; day = nextDayKey(day)) {
			if (isWeekdayKey(day)) returns.push(0);
		}
	};

	for (let i = 1; i < curve.length; i++) {
		const previous = curve[i - 1];
		const point = curve[i];

		if (previous.balance > 0) pushIdleWeekdays(previous.date, point.date);

		const pnl = point.performance - previous.performance;
		const capital = point.balance - pnl;
		if (capital <= 0) continue;
		if (pnl === 0 && !isWeekdayKey(point.date)) continue;
		returns.push(pnl / capital);
	}

	const last = curve.at(-1);
	if (endDay && last && last.balance > 0) {
		pushIdleWeekdays(last.date, nextDayKey(endDay));
	}

	const days = returns.length;
	if (days < MIN_SHARPE_DAYS) return { value: null, days };

	const mean = returns.reduce((a, b) => a + b, 0) / days;
	const variance =
		returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (days - 1);
	const stddev = Math.sqrt(variance);
	if (stddev === 0) return { value: null, days };
	return { value: (mean / stddev) * Math.sqrt(252), days };
}

/**
 * Largest peak-to-trough fall caused by trading.
 *
 * A deposit or a withdrawal moves the peak by the same amount as the balance,
 * so cash flows never create or hide a drawdown. The percent is relative to
 * that flow-adjusted peak, and is null when the peak is not positive.
 * IMPORTANT: points must be sorted by date ascending.
 */
export function computeMaxDrawdown(curve: EquityPoint[]): {
	dollars: number;
	percent: number | null;
} {
	if (!curve.length) return { dollars: 0, percent: 0 };

	let peak = curve[0].balance;
	let maxDd = 0;
	let maxDdPct: number | null = 0;

	for (let i = 1; i < curve.length; i++) {
		const previous = curve[i - 1];
		const point = curve[i];
		const cashFlow =
			point.balance -
			previous.balance -
			(point.performance - previous.performance);
		peak = Math.max(peak + cashFlow, point.balance);

		const dd = peak - point.balance;
		if (dd > maxDd) {
			maxDd = dd;
			maxDdPct = peak > 0 ? round2((dd / peak) * 100) : null;
		}
	}

	return { dollars: round2(maxDd), percent: maxDdPct };
}

export type PayoffRatio = {
	/** null without at least one win and one loss. */
	ratio: number | null;
	avgWin: number | null;
	avgLoss: number | null;
	wins: number;
	losses: number;
};

/** Average win over absolute average loss. Breakeven trades are ignored. */
export function computePayoffRatio(trades: ClosedTrade[]): PayoffRatio {
	const wins = trades.filter((t) => t.netPnl > 0);
	const losses = trades.filter((t) => t.netPnl < 0);
	const avgWin = wins.length
		? wins.reduce((a, t) => a + t.netPnl, 0) / wins.length
		: null;
	const avgLoss = losses.length
		? Math.abs(losses.reduce((a, t) => a + t.netPnl, 0) / losses.length)
		: null;
	return {
		ratio: avgWin !== null && avgLoss ? avgWin / avgLoss : null,
		avgWin,
		avgLoss,
		wins: wins.length,
		losses: losses.length,
	};
}

/** Mean hold duration in hours across closed trades; null for no trades. */
export function computeAvgHoldTime(trades: ClosedTrade[]): number | null {
	if (!trades.length) return null;
	const totalHours = trades.reduce(
		(acc, t) =>
			acc + (t.exitDate.getTime() - t.entryDate.getTime()) / 3_600_000,
		0,
	);
	return totalHours / trades.length;
}

export type AccountReturn = {
	/** null for a trade that is not closed, or without a positive balance at entry. */
	percent: number | null;
	balanceAtEntry: number;
};

/**
 * Net P&L over the balance just before entry. That balance is every deposit,
 * withdrawal, adjustment and closed trade realized before the entry time.
 */
export function computeAccountReturn(
	trade: TradeRecord,
	records: TradeRecord[],
	cashFlows: CashFlow[],
): AccountReturn {
	const beforeEntry = {
		from: null,
		to: new Date(trade.entryDate.getTime() - 1),
	};
	const balanceAtEntry = summarizeTrades(records, cashFlows, beforeEntry).stats
		.totalBalance;
	const isAvailable = trade.status === TradeStatus.Closed && balanceAtEntry > 0;
	return {
		percent: isAvailable ? (trade.netPnl / balanceAtEntry) * 100 : null,
		balanceAtEntry,
	};
}

export type GroupSummary = {
	count: number;
	wins: number;
	losses: number;
	breakeven: number;
	totalPnl: number;
	avgPnl: number;
	/** null when no trade in the group was a win or a loss. */
	winRate: number | null;
};

/** Every per-group total on every screen comes from here, so they agree. */
export function summarizeGroup(pnls: number[]): GroupSummary {
	const wins = pnls.filter((pnl) => pnl > 0).length;
	const losses = pnls.filter((pnl) => pnl < 0).length;
	const totalPnl = round2(pnls.reduce((a, b) => a + b, 0));
	return {
		count: pnls.length,
		wins,
		losses,
		breakeven: pnls.length - wins - losses,
		totalPnl,
		avgPnl: pnls.length ? round2(totalPnl / pnls.length) : 0,
		winRate: winRateOf(wins, losses),
	};
}

export function summarizeGroups<T, K>(
	items: T[],
	keyOf: (item: T) => K,
	pnlOf: (item: T) => number,
): Map<K, GroupSummary> {
	const pnlsByKey = new Map<K, number[]>();
	for (const item of items) {
		const key = keyOf(item);
		const pnls = pnlsByKey.get(key);
		if (pnls) pnls.push(pnlOf(item));
		else pnlsByKey.set(key, [pnlOf(item)]);
	}
	return new Map(
		Array.from(pnlsByKey, ([key, pnls]) => [key, summarizeGroup(pnls)]),
	);
}
