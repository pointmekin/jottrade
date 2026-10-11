import { realizedAt } from "./analytics";
import { toDayKey } from "./date";
import type { Realization } from "./position";
import { type TradeSide, TradeStatus } from "./trade";

export type CalendarTrade = {
	id: number;
	symbol: string;
	side: TradeSide;
	status: TradeStatus | null;
	netPnl: number | null;
	/** The row has the P&L of exits on a day before the final close. */
	isPartialExit?: boolean;
};

export type CalendarDay = {
	/** Closed trades and partial exits. */
	netPnl: number;
	/** Closed and open trades. A partial exit is not a trade. */
	tradeCount: number;
	trades: CalendarTrade[];
};

export type CalendarTradeRow = CalendarTrade & {
	entryDate: Date;
	exitDate: Date | null;
	realizations?: Realization[];
};

type Range = { from: Date; to: Date };

const inRange = (at: Date, range: Range) => at >= range.from && at < range.to;

function place(
	days: Record<string, CalendarDay>,
	key: string,
	trade: CalendarTrade,
) {
	days[key] ??= { netPnl: 0, tradeCount: 0, trades: [] };
	days[key].netPnl += trade.netPnl ?? 0;
	if (!trade.isPartialExit) days[key].tradeCount += 1;
	days[key].trades.push(trade);
}

function placePosition(
	days: Record<string, CalendarDay>,
	{ entryDate, exitDate, realizations = [], ...trade }: CalendarTradeRow,
	range: Range,
	timeZone: string,
) {
	const isClosed = trade.status === TradeStatus.Closed;
	if (!isClosed && inRange(entryDate, range))
		place(days, toDayKey(entryDate, timeZone), { ...trade, netPnl: null });
	const closeKey =
		isClosed && exitDate ? toDayKey(exitDate, timeZone) : undefined;
	const byDay = new Map<string, number>();
	for (const { at, amount } of realizations) {
		if (!inRange(at, range)) continue;
		const key = toDayKey(at, timeZone);
		byDay.set(key, (byDay.get(key) ?? 0) + amount);
	}
	for (const [key, netPnl] of byDay) {
		const isFinal = key === closeKey;
		place(days, key, {
			...trade,
			netPnl,
			...(isFinal ? {} : { isPartialExit: true }),
		});
	}
}

/** Uses the dashboard rule. The range is half-open, so a month boundary never counts a trade twice. */
export function groupTradesByDay(
	rows: CalendarTradeRow[],
	range: Range,
	timeZone: string,
): Record<string, CalendarDay> {
	const days: Record<string, CalendarDay> = {};
	for (const row of rows) {
		if (row.realizations) {
			placePosition(days, row, range, timeZone);
			continue;
		}
		const { entryDate, exitDate, ...trade } = row;
		const isClosed = trade.status === TradeStatus.Closed;
		const at = isClosed ? realizedAt({ entryDate, exitDate }) : entryDate;
		if (!inRange(at, range)) continue;
		place(
			days,
			toDayKey(at, timeZone),
			isClosed ? trade : { ...trade, netPnl: null },
		);
	}
	return days;
}

const plural = (count: number, word: string) =>
	`${count} ${word}${count === 1 ? "" : "s"}`;

/** For example "2 trades" or "1 trade · 1 partial exit". */
export function dayActivityLabel(day: CalendarDay) {
	const partialExits = day.trades.length - day.tradeCount;
	const parts = [
		day.tradeCount > 0 || partialExits === 0
			? plural(day.tradeCount, "trade")
			: "",
		partialExits > 0 ? plural(partialExits, "partial exit") : "",
	];
	return parts.filter(Boolean).join(" · ");
}
