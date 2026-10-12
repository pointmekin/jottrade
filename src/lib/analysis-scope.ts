import { z } from "zod";
import type { DateRange } from "./analytics";
import { isValidTimeZone } from "./date";
import { PlanAdherence } from "./playbook-check";
import { RuleOutcome } from "./risk-rule-evaluation";
import { TradeConfidence, TradeSide, TradeStatus } from "./trade";
import { TAG_FILTER_LIMIT, TagMatch } from "./trade-tag";
import { TradingSession } from "./trading-session";

export const SymbolMatch = {
	Contains: "contains",
	Exact: "exact",
} as const;

export type SymbolMatch = (typeof SymbolMatch)[keyof typeof SymbolMatch];

const timeZoneSchema = z
	.string()
	.refine(isValidTimeZone, "Invalid IANA timezone");

/**
 * The client resolves a period preset against its own clock, then sends
 * absolute bounds. That keeps "this month" aligned with the user's timezone.
 */
export const tradeFilterSchema = z.object({
	portfolioId: z.number().int().positive(),
	symbol: z.string().optional(),
	symbolMatch: z.enum(SymbolMatch).optional(),
	side: z.enum(TradeSide).optional(),
	status: z.enum(TradeStatus).optional(),
	setupId: z.union([z.number(), z.literal("none")]).optional(),
	adherence: z.enum(PlanAdherence).optional(),
	ruleCheck: z.enum(RuleOutcome).optional(),
	confidence: z.array(z.enum(TradeConfidence)).optional(),
	mistake: z.array(z.string()).optional(),
	tagIds: z.array(z.number().int().positive()).max(TAG_FILTER_LIMIT).optional(),
	tagMatch: z.enum(TagMatch).optional(),
	/** 0 is Sunday. Closed trades by exit, other trades by entry, in `timeZone`. */
	weekday: z.number().int().min(0).max(6).optional(),
	entryHour: z.number().int().min(0).max(23).optional(),
	/** A fixed UTC window of the entry time, as in `SESSION_WINDOW`. */
	session: z.enum(TradingSession).optional(),
	dateFrom: z.iso.datetime().optional(),
	dateTo: z.iso.datetime().optional(),
	timeZone: timeZoneSchema.optional(),
});

export type TradeFilter = z.infer<typeof tradeFilterSchema>;

export const analysisScopeSchema = tradeFilterSchema.extend({
	timeZone: timeZoneSchema.default("UTC"),
});

export type AnalysisScope = z.infer<typeof analysisScopeSchema>;

/** Cash flows have no trade attributes, so only the account and the period scope them. */
export function isTradeAttributeFiltered(filter: TradeFilter) {
	return Boolean(
		filter.symbol ||
			filter.side ||
			filter.status ||
			filter.setupId !== undefined ||
			filter.adherence ||
			filter.ruleCheck ||
			filter.confidence?.length ||
			filter.mistake?.length ||
			filter.tagIds?.length ||
			filter.weekday !== undefined ||
			filter.entryHour !== undefined ||
			filter.session,
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
