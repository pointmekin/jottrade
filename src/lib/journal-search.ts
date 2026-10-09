import { z } from "zod";
import type { AccountEntryRecord } from "./account-entry";
import { SymbolMatch } from "./analysis-scope";
import { PeriodPreset } from "./period";
import { TradeConfidence, TradeSide, TradeStatus } from "./trade";
import { SortDirection, TradeSortField } from "./trade-sort";
import { parseTagIds, TagMatch } from "./trade-tag";

export const JournalView = {
	All: "all",
	Trades: "trades",
	Adjustments: "adjustments",
	Funding: "funding",
} as const;

export type JournalView = (typeof JournalView)[keyof typeof JournalView];

export const JournalIntent = { Log: "log" } as const;

export const NO_STRATEGY = "none" as const;

/** One scope in the URL of the journal, the dashboard and the calendar. */
export const scopeSearchSchema = z.object({
	symbol: z.string().optional(),
	symbolMatch: z.enum(SymbolMatch).optional(),
	side: z.enum(TradeSide).optional(),
	status: z.enum(TradeStatus).optional(),
	setupId: z.string().optional(),
	confidence: z.string().optional(),
	mistake: z.string().optional(),
	tags: z.string().optional(),
	tagMatch: z.enum(TagMatch).optional(),
	period: z.enum(PeriodPreset).default(PeriodPreset.All),
	dateFrom: z.string().optional(),
	dateTo: z.string().optional(),
	savedView: z.number().int().positive().optional().catch(undefined),
});

export type ScopeSearch = z.infer<typeof scopeSearchSchema>;

export const SCOPE_SEARCH_KEYS = scopeSearchSchema.keyof().options;

/** Explicit undefined values, so a merge with the current search and retainSearchParams both drop them. */
export const CLEARED_TRADE_FILTERS = {
	symbol: undefined,
	symbolMatch: undefined,
	side: undefined,
	status: undefined,
	setupId: undefined,
	confidence: undefined,
	mistake: undefined,
	tags: undefined,
	tagMatch: undefined,
} satisfies Partial<ScopeSearch>;

export const journalSearchSchema = scopeSearchSchema.extend({
	intent: z.enum(JournalIntent).optional(),
	view: z.enum(JournalView).default(JournalView.All),
	page: z.number().int().min(1).default(1).catch(1),
	sort: z.enum(TradeSortField).optional().catch(undefined),
	dir: z.enum(SortDirection).optional().catch(undefined),
});

export type JournalSearch = z.infer<typeof journalSearchSchema>;

/** Old links used from/to; they map once to the shared dateFrom/dateTo names. */
export const dashboardSearchSchema = scopeSearchSchema
	.extend({ from: z.string().optional(), to: z.string().optional() })
	.transform(({ from, to, ...search }) => ({
		...search,
		dateFrom: search.dateFrom ?? from,
		dateTo: search.dateTo ?? to,
	}));

export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;

const CONFIDENCE_LEVELS = new Set<string>(Object.values(TradeConfidence));

const splitList = (value?: string) => value?.split(",").filter(Boolean);

function toSetupFilter(setupId?: string) {
	if (setupId === NO_STRATEGY) return NO_STRATEGY;
	return setupId ? Number(setupId) : undefined;
}

export function toTradeQuery(
	search: ScopeSearch & Pick<Partial<JournalSearch>, "page" | "sort" | "dir">,
	range: { from: Date | null; to: Date | null },
) {
	const confidence = splitList(search.confidence)?.filter(
		(value): value is TradeConfidence => CONFIDENCE_LEVELS.has(value),
	);
	return {
		symbol: search.symbol,
		symbolMatch: search.symbolMatch,
		side: search.side,
		status: search.status,
		setupId: toSetupFilter(search.setupId),
		confidence,
		mistake: splitList(search.mistake),
		tagIds: parseTagIds(search.tags),
		tagMatch: search.tagMatch,
		dateFrom: range.from?.toISOString(),
		dateTo: range.to?.toISOString(),
		page: search.page,
		sort: search.sort,
		dir: search.dir,
	};
}

export const ChartGroup = { Strategy: "strategy", Symbol: "symbol" } as const;

export type ChartGroup = (typeof ChartGroup)[keyof typeof ChartGroup];

/** Opens only closed trades, because the chart groups count closed trades. */
export function drillDownSearch(group: ChartGroup, key: string) {
	const filter =
		group === ChartGroup.Strategy
			? { setupId: key }
			: { symbol: key, symbolMatch: SymbolMatch.Exact };
	return { ...filter, status: TradeStatus.Closed };
}

const isBetween = (date: Date, from?: Date | null, to?: Date | null) =>
	!(from && date < from) && !(to && date > to);

/** The journal is newest first, so a page of trades spans a date window; adjustments outside it belong to another page. */
export function adjustmentsOnPage(
	adjustments: AccountEntryRecord[],
	page: { number: number; totalPages: number; newest?: Date; oldest?: Date },
) {
	const upper = page.number > 1 ? page.newest : undefined;
	const lower = page.number < page.totalPages ? page.oldest : undefined;
	return adjustments.filter((entry) =>
		isBetween(new Date(entry.occurredAt), lower, upper),
	);
}

export function adjustmentsInRange(
	entries: AccountEntryRecord[],
	range: { from: Date | null; to: Date | null },
) {
	return entries.filter((entry) =>
		isBetween(new Date(entry.occurredAt), range.from, range.to),
	);
}
