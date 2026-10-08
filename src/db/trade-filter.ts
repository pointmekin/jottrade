import { and, eq, gte, inArray, isNull, like, lte, sql } from "drizzle-orm";
import { trades } from "@/db/schema";
import { tagCondition } from "@/db/trade-tags";
import type { TradeFilter } from "@/lib/analysis-scope";

/** The scope date of every screen: closed trades by exit, open trades by entry. */
export const tradeScopeDate = sql`coalesce(${trades.exitDate}, ${trades.entryDate})`;

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
