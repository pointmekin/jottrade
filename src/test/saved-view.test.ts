import { describe, expect, it } from "vitest";
import { SymbolMatch } from "@/lib/analysis-scope";
import { journalSearchSchema, NO_STRATEGY } from "@/lib/journal-search";
import { PeriodPreset } from "@/lib/period";
import {
	dropUnknownIds,
	isSameScope,
	pickViewScope,
	savedViewNameSchema,
	savedViewScopeSchema,
	storedViewScopeSchema,
} from "@/lib/saved-view";
import { TradeStatus } from "@/lib/trade";
import { TagMatch } from "@/lib/trade-tag";

const known = { strategyIds: new Set([1]), tagIds: new Set([2, 3]) };

describe("saved view scope", () => {
	it("round-trips the URL scope through the stored document", () => {
		const search = journalSearchSchema.parse({
			symbol: "EURUSD",
			symbolMatch: SymbolMatch.Exact,
			status: TradeStatus.Closed,
			setupId: "1",
			tags: "2,3",
			tagMatch: TagMatch.All,
			period: PeriodPreset.Custom,
			dateFrom: "2026-02-01",
			dateTo: "2026-02-28",
			page: 3,
			savedView: 9,
		});
		const scope = savedViewScopeSchema.parse(pickViewScope(search));
		const stored = structuredClone({ ...scope, v: 1, pinnedAccount: false });
		const { v, pinnedAccount, ...read } = storedViewScopeSchema.parse(stored);

		expect([v, pinnedAccount]).toEqual([1, false]);
		expect(read).toEqual(scope);
		expect(read).not.toHaveProperty("page");
		expect(read).not.toHaveProperty("savedView");
		expect(isSameScope(search, read)).toBe(true);
		expect(isSameScope({ ...search, symbol: "GBPUSD" }, read)).toBe(false);
	});

	it("keeps a preset, not resolved dates", () => {
		expect(
			savedViewScopeSchema.parse({ period: PeriodPreset.Last30Days }),
		).toEqual({ period: PeriodPreset.Last30Days });
		expect(() =>
			savedViewScopeSchema.parse({ dateFrom: "2026-02-01T00:00:00Z" }),
		).toThrow();
	});

	it("rejects an unknown version", () => {
		expect(() =>
			storedViewScopeSchema.parse({ v: 2, pinnedAccount: false }),
		).toThrow();
	});

	it("drops unknown strategy and tag ids and counts them", () => {
		const scope = savedViewScopeSchema.parse({
			setupId: "7",
			tags: "2,8,9",
			tagMatch: TagMatch.All,
		});
		expect(dropUnknownIds(scope, known)).toEqual({
			scope: { ...scope, setupId: undefined, tags: "2" },
			droppedFilters: 3,
		});
	});

	it("drops the tag match with the last tag", () => {
		const scope = savedViewScopeSchema.parse({
			tags: "8",
			tagMatch: TagMatch.All,
		});
		expect(dropUnknownIds(scope, known).scope).toMatchObject({
			tags: undefined,
			tagMatch: undefined,
		});
	});

	it("keeps known ids and the no-strategy filter", () => {
		const scope = savedViewScopeSchema.parse({
			setupId: NO_STRATEGY,
			tags: "3",
		});
		expect(dropUnknownIds(scope, known)).toEqual({ scope, droppedFilters: 0 });
	});
});

describe("saved view name", () => {
	it("trims the name and limits it to 60 characters", () => {
		expect(savedViewNameSchema.parse("  Feb SPY ")).toBe("Feb SPY");
		expect(() => savedViewNameSchema.parse("   ")).toThrow(
			"Enter a view name.",
		);
		expect(() => savedViewNameSchema.parse("x".repeat(61))).toThrow(
			"Use 60 characters or fewer.",
		);
	});
});
