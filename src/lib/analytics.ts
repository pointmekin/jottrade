import { AccountEntryKind } from "./account-entry";
import { roundCents } from "./currency";
import { previousDayKey, toDayKey } from "./date";
import { summarizeGroup } from "./group-summary";
import { TradeStatus } from "./trade";

/** A deposit is positive and a withdrawal is negative. */
export type CashFlow = {
	occurredAt: Date;
	amount: number;
	kind?: string;
};

/** `null` on a side means unbounded. */
export type DateRange = {
	from: Date | null;
	to: Date | null;
};

export type TradeRecord = {
	status: string | null;
	entryDate: Date;
	exitDate: Date | null;
	netPnl: number;
};

/** `balance` is cash. `performance` is trading P&L since the window opened, without deposits and withdrawals. */
export type EquityPoint = {
	date: string;
	balance: number;
	performance: number;
};

export type TradeStats = {
	openingBalance: number;
	netDeposits: number;
	totalBalance: number;
	totalPnL: number;
	activeTrades: number;
	winRate: number | null;
	profitFactor: number | null;
	totalTrades: number;
	winningTrades: number;
	losingTrades: number;
	breakevenTrades: number;
};

type DailyAmounts = Map<string, number>;

const UNBOUNDED: DateRange = { from: null, to: null };

const isBefore = (date: Date, from: Date | null) =>
	from !== null && date.getTime() < from.getTime();

const isAfter = (date: Date, to: Date | null) =>
	to !== null && date.getTime() > to.getTime();

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function addToDay(amounts: DailyAmounts, day: string, amount: number) {
	amounts.set(day, (amounts.get(day) ?? 0) + amount);
}

/** A closed trade without an exit time is realized at entry. */
export function realizedAt(trade: TradeRecord): Date {
	return trade.exitDate ?? trade.entryDate;
}

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

/** Broker adjustments (swaps, dividends) are trading P&L. Deposits and withdrawals are not. */
function bucketCashFlows(
	cashFlows: CashFlow[],
	range: DateRange,
	timeZone: string,
) {
	const buckets = {
		carried: 0,
		netDeposits: 0,
		adjustments: 0,
		depositsByDay: new Map<string, number>(),
		adjustmentsByDay: new Map<string, number>(),
	};
	for (const flow of cashFlows) {
		const amount = finite(flow.amount);
		if (isAfter(flow.occurredAt, range.to)) continue;
		if (isBefore(flow.occurredAt, range.from)) {
			buckets.carried += amount;
			continue;
		}
		const day = toDayKey(flow.occurredAt, timeZone);
		if (flow.kind === AccountEntryKind.Adjustment) {
			buckets.adjustments += amount;
			addToDay(buckets.adjustmentsByDay, day, amount);
		} else {
			buckets.netDeposits += amount;
			addToDay(buckets.depositsByDay, day, amount);
		}
	}
	return buckets;
}

function buildEquityCurve(
	openingBalance: number,
	tradePnlByDay: DailyAmounts,
	adjustmentsByDay: DailyAmounts,
	depositsByDay: DailyAmounts,
): EquityPoint[] {
	const days = [
		...new Set([
			...tradePnlByDay.keys(),
			...adjustmentsByDay.keys(),
			...depositsByDay.keys(),
		]),
	].sort((a, b) => a.localeCompare(b));
	if (days.length === 0) return [];

	let balance = openingBalance;
	let performance = 0;
	const curve: EquityPoint[] = [
		{
			date: previousDayKey(days[0]),
			balance: roundCents(openingBalance),
			performance: 0,
		},
	];
	for (const day of days) {
		const tradingPnl =
			(tradePnlByDay.get(day) ?? 0) + (adjustmentsByDay.get(day) ?? 0);
		performance += tradingPnl;
		balance += tradingPnl + (depositsByDay.get(day) ?? 0);
		curve.push({
			date: day,
			balance: roundCents(balance),
			performance: roundCents(performance),
		});
	}
	return curve;
}

/**
 * The curve starts from the balance carried into the window, so a deposit
 * raises the balance without counting as a profit.
 */
export function summarizeTrades(
	records: TradeRecord[],
	cashFlows: CashFlow[] = [],
	range: DateRange = UNBOUNDED,
	timeZone = "UTC",
): { stats: TradeStats; equityCurve: EquityPoint[] } {
	const flows = bucketCashFlows(cashFlows, range, timeZone);
	const inRange = closedTradesInRange(records, range);
	const pnls = inRange.map((trade) => finite(trade.netPnl));
	const carriedPnl = sum(
		records
			.filter(
				(trade) =>
					trade.status === TradeStatus.Closed &&
					isBefore(realizedAt(trade), range.from),
			)
			.map((trade) => finite(trade.netPnl)),
	);

	const tradePnlByDay: DailyAmounts = new Map();
	for (const trade of inRange) {
		addToDay(
			tradePnlByDay,
			toDayKey(realizedAt(trade), timeZone),
			finite(trade.netPnl),
		);
	}

	const openingBalance = flows.carried + carriedPnl;
	const equityCurve = buildEquityCurve(
		openingBalance,
		tradePnlByDay,
		flows.adjustmentsByDay,
		flows.depositsByDay,
	);
	const group = summarizeGroup(pnls);
	const grossProfit = sum(pnls.filter((pnl) => pnl > 0));
	const grossLoss = -sum(pnls.filter((pnl) => pnl < 0));
	const activeTrades = records.filter(
		(trade) =>
			trade.status === TradeStatus.Open && !isAfter(trade.entryDate, range.to),
	).length;

	return {
		stats: {
			openingBalance: roundCents(openingBalance),
			netDeposits: roundCents(flows.netDeposits),
			totalBalance: equityCurve.at(-1)?.balance ?? roundCents(openingBalance),
			totalPnL: roundCents(sum(pnls) + flows.adjustments),
			activeTrades,
			winRate: group.winRate,
			profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
			totalTrades: group.count,
			winningTrades: group.wins,
			losingTrades: group.losses,
			breakevenTrades: group.breakeven,
		},
		equityCurve,
	};
}
