import { describe, expect, it } from "vitest";
import { SymbolMatch } from "@/lib/analysis-scope";
import {
	ChartGroup,
	dashboardSearchSchema,
	drillDownSearch,
	journalSearchSchema,
	NO_STRATEGY,
	SCOPE_SEARCH_KEYS,
	toTradeQuery,
} from "@/lib/journal-search";
import { PeriodPreset } from "@/lib/period";
import { TradeStatus } from "@/lib/trade";

describe("journal search", () => {
	it.each([0, -2, 1.5, "abc", undefined])("reads page %s as page 1", (page) => {
		expect(journalSearchSchema.parse({ page }).page).toBe(1);
	});

	it("keeps a valid page", () => {
		expect(journalSearchSchema.parse({ page: 3 }).page).toBe(3);
	});

	it("shares one set of scope names", () => {
		expect(SCOPE_SEARCH_KEYS).toEqual([
			"symbol",
			"symbolMatch",
			"side",
			"status",
			"setupId",
			"confidence",
			"mistake",
			"tags",
			"tagMatch",
			"period",
			"dateFrom",
			"dateTo",
		]);
	});
});

describe("dashboard search", () => {
	it("maps the old from/to names to dateFrom/dateTo", () => {
		expect(
			dashboardSearchSchema.parse({
				period: PeriodPreset.Custom,
				from: "2026-02-01",
				to: "2026-02-28",
			}),
		).toEqual({
			period: PeriodPreset.Custom,
			dateFrom: "2026-02-01",
			dateTo: "2026-02-28",
		});
	});

	it("prefers dateFrom/dateTo over the old names", () => {
		const search = dashboardSearchSchema.parse({
			from: "2026-01-01",
			dateFrom: "2026-02-01",
			symbol: "SPY",
		});
		expect(search).toMatchObject({ dateFrom: "2026-02-01", symbol: "SPY" });
		expect(search).not.toHaveProperty("from");
	});
});

describe("chart drill-down search", () => {
	it.each([
		[ChartGroup.Strategy, "7", { setupId: "7" }],
		[ChartGroup.Strategy, NO_STRATEGY, { setupId: NO_STRATEGY }],
		[
			ChartGroup.Symbol,
			"EURUSD",
			{ symbol: "EURUSD", symbolMatch: SymbolMatch.Exact },
		],
	])("maps the %s group %s to closed trades", (group, key, filter) => {
		expect(drillDownSearch(group, key)).toEqual({
			...filter,
			status: TradeStatus.Closed,
		});
	});

	it("keeps the scope and sends the group to the trade query", () => {
		const search = journalSearchSchema.parse({
			period: PeriodPreset.Last30Days,
			side: "LONG",
			...drillDownSearch(ChartGroup.Symbol, "EURUSD"),
		});

		expect(toTradeQuery(search, { from: null, to: null })).toMatchObject({
			side: "LONG",
			symbol: "EURUSD",
			symbolMatch: SymbolMatch.Exact,
			status: TradeStatus.Closed,
		});
		expect(
			toTradeQuery(
				journalSearchSchema.parse(drillDownSearch(ChartGroup.Strategy, "none")),
				{ from: null, to: null },
			).setupId,
		).toBe(NO_STRATEGY);
	});
});
