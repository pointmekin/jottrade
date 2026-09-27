import { realizedAt } from "./analytics";
import { toDayKey } from "./date";
import { type TradeSide, TradeStatus } from "./trade";

export type CalendarTrade = {
	id: number;
	symbol: string;
	side: TradeSide;
	status: TradeStatus | null;
	netPnl: number | null;
};

export type CalendarDay = {
	/** Closed trades only. */
	netPnl: number;
	/** Closed and open trades. */
	tradeCount: number;
	trades: CalendarTrade[];
};

export type CalendarTradeRow = CalendarTrade & {
	entryDate: Date;
	exitDate: Date | null;
};

/** Uses the dashboard rule. The range is half-open, so a month boundary never counts a trade twice. */
export function groupTradesByDay(
	rows: CalendarTradeRow[],
	range: { from: Date; to: Date },
	timeZone: string,
): Record<string, CalendarDay> {
	const days: Record<string, CalendarDay> = {};
	for (const { entryDate, exitDate, ...trade } of rows) {
		const isClosed = trade.status === TradeStatus.Closed;
		const at = isClosed ? realizedAt({ entryDate, exitDate }) : entryDate;
		if (at < range.from || at >= range.to) continue;
		const placed = isClosed ? trade : { ...trade, netPnl: null };
		const key = toDayKey(at, timeZone);
		days[key] ??= { netPnl: 0, tradeCount: 0, trades: [] };
		days[key].netPnl += placed.netPnl ?? 0;
		days[key].tradeCount += 1;
		days[key].trades.push(placed);
	}
	return days;
}
