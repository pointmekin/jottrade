import { z } from "zod";
import type { DateRange } from "./analytics";
import { isValidTimeZone } from "./date";
import { TradeConfidence, TradeSide, TradeStatus } from "./trade";
import { TAG_FILTER_LIMIT, TagMatch } from "./trade-tag";

/**
 * The client resolves a period preset against its own clock, then sends
 * absolute bounds. That keeps "this month" aligned with the user's timezone.
 */
export const tradeFilterSchema = z.object({
	portfolioId: z.number().int().positive(),
	symbol: z.string().optional(),
	side: z.enum(TradeSide).optional(),
	status: z.enum(TradeStatus).optional(),
	setupId: z.union([z.number(), z.literal("none")]).optional(),
	confidence: z.array(z.enum(TradeConfidence)).optional(),
	mistake: z.array(z.string()).optional(),
	tagIds: z.array(z.number().int().positive()).max(TAG_FILTER_LIMIT).optional(),
	tagMatch: z.enum(TagMatch).optional(),
	dateFrom: z.iso.datetime().optional(),
	dateTo: z.iso.datetime().optional(),
});

export type TradeFilter = z.infer<typeof tradeFilterSchema>;

export const analysisScopeSchema = tradeFilterSchema.extend({
	timeZone: z
		.string()
		.refine(isValidTimeZone, "Invalid IANA timezone")
		.default("UTC"),
});

export type AnalysisScope = z.infer<typeof analysisScopeSchema>;

/** Cash flows have no trade attributes, so only the account and the period scope them. */
export function isTradeAttributeFiltered(filter: TradeFilter) {
	return Boolean(
		filter.symbol ||
			filter.side ||
			filter.status ||
			filter.setupId !== undefined ||
			filter.confidence?.length ||
			filter.mistake?.length ||
			filter.tagIds?.length,
	);
}

export function toDateRange(
	scope: Pick<TradeFilter, "dateFrom" | "dateTo">,
): DateRange {
	return {
		from: scope.dateFrom ? new Date(scope.dateFrom) : null,
		to: scope.dateTo ? new Date(scope.dateTo) : null,
	};
}
