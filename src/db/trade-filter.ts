import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	like,
	lte,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import { trades } from "@/db/schema";
import { tagCondition } from "@/db/trade-tags";
import type { TradeFilter } from "@/lib/analysis-scope";
import { TradeStatus } from "@/lib/trade";
import {
	SortDirection,
	type TradeSort,
	TradeSortField,
} from "@/lib/trade-sort";

/** The scope date of every screen: closed trades by exit, other trades by entry, as in `groupTradesByDay`. */
export const tradeScopeDate = sql`case when ${trades.status} = ${TradeStatus.Closed} then coalesce(${trades.exitDate}, ${trades.entryDate}) else ${trades.entryDate} end`;

/** Encodes like the timestamp columns, so the bound is UTC in any server timezone. */
export const scopeDateBound = (iso: string) =>
	sql.param(new Date(iso), trades.entryDate);

function setupCondition(setupId: TradeFilter["setupId"]) {
	if (setupId === "none") return isNull(trades.setupId);
	if (setupId === undefined) return undefined;
	return eq(trades.setupId, setupId);
}

export function tradeConditions(userId: string, filter: TradeFilter) {
	return and(
		eq(trades.userId, userId),
		eq(trades.portfolioId, filter.portfolioId),
		filter.symbol ? like(trades.symbol, `%${filter.symbol}%`) : undefined,
		filter.side ? eq(trades.side, filter.side) : undefined,
		filter.status ? eq(trades.status, filter.status) : undefined,
		setupCondition(filter.setupId),
		filter.confidence?.length
			? inArray(trades.confidence, filter.confidence)
			: undefined,
		filter.mistake?.length
			? inArray(trades.mistake, filter.mistake)
			: undefined,
		tagCondition(filter.tagIds, filter.tagMatch),
		filter.dateFrom
			? gte(tradeScopeDate, scopeDateBound(filter.dateFrom))
			: undefined,
		filter.dateTo
			? lte(tradeScopeDate, scopeDateBound(filter.dateTo))
			: undefined,
	);
}

const SORT_COLUMN = {
	[TradeSortField.EntryDate]: trades.entryDate,
	[TradeSortField.ScopeDate]: tradeScopeDate,
	[TradeSortField.Symbol]: trades.symbol,
	[TradeSortField.NetPnl]: trades.netPnl,
	[TradeSortField.ReturnPercent]: trades.returnPercent,
} satisfies Record<TradeSortField, SQLWrapper>;

/** The id breaks ties, so a page boundary never repeats or skips a row. */
export function tradeOrder({ sort, dir }: TradeSort) {
	if (dir === SortDirection.Asc)
		return [sql`${SORT_COLUMN[sort]} asc nulls last`, asc(trades.id)];
	return [sql`${SORT_COLUMN[sort]} desc nulls last`, desc(trades.id)];
}
