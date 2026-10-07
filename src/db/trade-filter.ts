import { and, eq, gte, inArray, isNull, like, lte } from "drizzle-orm";
import { z } from "zod";
import { trades } from "@/db/schema";
import { TradeConfidence, TradeSide, TradeStatus } from "@/lib/trade";

export const tradeFilterSchema = z.object({
	portfolioId: z.number().int().positive(),
	symbol: z.string().optional(),
	side: z.enum(TradeSide).optional(),
	status: z.enum(TradeStatus).optional(),
	setupId: z.union([z.number(), z.literal("none")]).optional(),
	confidence: z.array(z.enum(TradeConfidence)).optional(),
	mistake: z.array(z.string()).optional(),
	dateFrom: z.string().optional(),
	dateTo: z.string().optional(),
});

export type TradeFilter = z.infer<typeof tradeFilterSchema>;

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
		filter.dateFrom
			? gte(trades.entryDate, new Date(filter.dateFrom))
			: undefined,
		filter.dateTo ? lte(trades.entryDate, new Date(filter.dateTo)) : undefined,
	);
}
