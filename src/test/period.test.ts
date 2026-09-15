import { describe, expect, it } from "vitest";
import { describePeriod, PeriodPreset, resolvePeriod } from "../lib/period";
import { rangeSchema, toDateRange } from "../server/rangeInput";

// A fixed clock keeps the preset windows deterministic.
const NOW = new Date(2025, 4, 15, 13, 30); // 15 May 2025, local time

const iso = (date: Date | null) => (date ? date.toISOString() : null);

describe("resolvePeriod", () => {
	it("leaves both bounds open for all time", () => {
		expect(resolvePeriod({ preset: PeriodPreset.All }, NOW)).toEqual({
			from: null,
			to: null,
		});
	});

	it("defaults to all time when no preset is given", () => {
		expect(resolvePeriod(undefined, NOW)).toEqual({ from: null, to: null });
	});

	it("includes today in the last 30 days", () => {
		const { from, to } = resolvePeriod(
			{ preset: PeriodPreset.Last30Days },
			NOW,
		);
		expect(from).toEqual(new Date(2025, 3, 16, 0, 0, 0, 0));
		expect(to?.getDate()).toBe(15);
		expect(to?.getHours()).toBe(23);
	});

	it("starts year to date on 1 January", () => {
		const { from } = resolvePeriod({ preset: PeriodPreset.YearToDate }, NOW);
		expect(from).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
	});

	it("bounds last month to that month only", () => {
		const { from, to } = resolvePeriod({ preset: PeriodPreset.LastMonth }, NOW);
		expect(from).toEqual(new Date(2025, 3, 1, 0, 0, 0, 0));
		expect(to?.getMonth()).toBe(3);
		expect(to?.getDate()).toBe(30);
	});

	it("bounds last year to that calendar year", () => {
		const { from, to } = resolvePeriod({ preset: PeriodPreset.LastYear }, NOW);
		expect(from).toEqual(new Date(2024, 0, 1, 0, 0, 0, 0));
		expect(to?.getFullYear()).toBe(2024);
		expect(to?.getMonth()).toBe(11);
	});

	it("reads a custom range and extends the end to the full day", () => {
		const { from, to } = resolvePeriod(
			{ preset: PeriodPreset.Custom, from: "2025-02-01", to: "2025-02-10" },
			NOW,
		);
		expect(from).toEqual(new Date(2025, 1, 1, 0, 0, 0, 0));
		expect(to?.getDate()).toBe(10);
		expect(to?.getHours()).toBe(23);
	});

	it("leaves a missing custom bound open", () => {
		const { from, to } = resolvePeriod(
			{ preset: PeriodPreset.Custom, from: "2025-02-01" },
			NOW,
		);
		expect(iso(from)).not.toBeNull();
		expect(to).toBeNull();
	});
});

describe("describePeriod", () => {
	it("names a preset", () => {
		expect(describePeriod({ preset: PeriodPreset.YearToDate }, NOW)).toBe(
			"Year to date",
		);
	});

	it("spells out a custom range", () => {
		expect(
			describePeriod(
				{ preset: PeriodPreset.Custom, from: "2025-02-01", to: "2025-02-10" },
				NOW,
			),
		).toBe("Feb 1, 2025 – Feb 10, 2025");
	});
});

describe("reporting range input", () => {
	it("preserves browser-resolved Bangkok day boundaries and timezone", () => {
		const input = rangeSchema.parse({
			portfolioId: 1,
			from: "2025-01-02T17:00:00.000Z",
			to: "2025-01-03T16:59:59.999Z",
			timeZone: "Asia/Bangkok",
		});

		expect(toDateRange(input)).toEqual({
			from: new Date("2025-01-02T17:00:00.000Z"),
			to: new Date("2025-01-03T16:59:59.999Z"),
		});
		expect(input.timeZone).toBe("Asia/Bangkok");
	});
});
