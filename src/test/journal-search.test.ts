import { describe, expect, it } from "vitest";
import {
	dashboardSearchSchema,
	journalSearchSchema,
	SCOPE_SEARCH_KEYS,
} from "@/lib/journal-search";
import { PeriodPreset } from "@/lib/period";

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
