import {
	type CashFlow,
	realizedAt,
	summarizeTrades,
	type EquityPoint,
	type TradeRecord,
} from "./analytics";
import { roundCents } from "./currency";
import { isWeekdayKey, nextDayKey } from "./date";
import { TradeStatus } from "./trade";

/** Below this many eligible days a Sharpe ratio is noise. */
export const MIN_SHARPE_DAYS = 20;
const TRADING_DAYS_PER_YEAR = 252;
const HOUR_MS = 3_600_000;

export type SharpeResult = { value: number | null; days: number };

export type Drawdown = { dollars: number; percent: number | null };

export type PayoffRatio = {
	ratio: number | null;
	avgWin: number | null;
	avgLoss: number | null;
	wins: number;
	losses: number;
};

export type AccountReturn = {
	percent: number | null;
	balanceAtEntry: number;
};

const mean = (values: number[]) =>
	values.reduce((a, b) => a + b, 0) / values.length;

function idleWeekdays(after: string, before: string): number[] {
	const zeros: number[] = [];
	for (let day = nextDayKey(after); day < before; day = nextDayKey(day)) {
		if (isWeekdayKey(day)) zeros.push(0);
	}
	return zeros;
}

/** A day's return is its trading P&L over the capital at its start: the previous balance plus same-day cash flows. */
function dailyReturns(curve: EquityPoint[], endDay?: string): number[] {
	const returns: number[] = [];
	for (let i = 1; i < curve.length; i++) {
		const previous = curve[i - 1];
		const point = curve[i];
		if (previous.balance > 0) {
			returns.push(...idleWeekdays(previous.date, point.date));
		}
		const pnl = point.performance - previous.performance;
		const capital = point.balance - pnl;
		const isIdleWeekend = pnl === 0 && !isWeekdayKey(point.date);
		if (capital > 0 && !isIdleWeekend) returns.push(pnl / capital);
	}
	const last = curve.at(-1);
	if (endDay && last && last.balance > 0) {
		returns.push(...idleWeekdays(last.date, nextDayKey(endDay)));
	}
	return returns;
}

/** Realized-P&L Sharpe: risk-free rate 0, sample standard deviation, √252. Points must be sorted by date. */
export function computeSharpe(
	curve: EquityPoint[],
	endDay?: string,
): SharpeResult {
	const returns = dailyReturns(curve, endDay);
	const days = returns.length;
	if (days < MIN_SHARPE_DAYS) return { value: null, days };

	const average = mean(returns);
	const variance =
		returns.reduce((acc, r) => acc + (r - average) ** 2, 0) / (days - 1);
	const stddev = Math.sqrt(variance);
	if (stddev === 0) return { value: null, days };
	return {
		value: (average / stddev) * Math.sqrt(TRADING_DAYS_PER_YEAR),
		days,
	};
}

/** A cash flow moves the peak with the balance, so it never creates or hides a drawdown. Points must be sorted by date. */
export function computeMaxDrawdown(curve: EquityPoint[]): Drawdown {
	if (!curve.length) return { dollars: 0, percent: 0 };

	let peak = curve[0].balance;
	let worst: Drawdown = { dollars: 0, percent: 0 };
	for (let i = 1; i < curve.length; i++) {
		const previous = curve[i - 1];
		const point = curve[i];
		const cashFlow =
			point.balance -
			previous.balance -
			(point.performance - previous.performance);
		peak = Math.max(peak + cashFlow, point.balance);

		const fall = peak - point.balance;
		if (fall > worst.dollars) {
			worst = {
				dollars: fall,
				percent: peak > 0 ? roundCents((fall / peak) * 100) : null,
			};
		}
	}
	return { ...worst, dollars: roundCents(worst.dollars) };
}

export function computePayoffRatio(trades: TradeRecord[]): PayoffRatio {
	const wins = trades.filter((t) => t.netPnl > 0).map((t) => t.netPnl);
	const losses = trades.filter((t) => t.netPnl < 0).map((t) => t.netPnl);
	const avgWin = wins.length ? mean(wins) : null;
	const avgLoss = losses.length ? Math.abs(mean(losses)) : null;
	return {
		ratio: avgWin !== null && avgLoss ? avgWin / avgLoss : null,
		avgWin,
		avgLoss,
		wins: wins.length,
		losses: losses.length,
	};
}

export function computeAvgHoldTime(trades: TradeRecord[]): number | null {
	if (!trades.length) return null;
	return mean(
		trades.map(
			(t) => (realizedAt(t).getTime() - t.entryDate.getTime()) / HOUR_MS,
		),
	);
}

/** The balance at entry is every cash flow and closed trade realized before the entry time. */
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
