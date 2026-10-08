import { describe, expect, it } from "vitest";
import {
	BULK_EDIT_LIMIT,
	BulkTradeAction,
	bulkEditSchema,
	normalizeTagName,
	parseTagIds,
	sameTagName,
	TAG_NAME_MAX_LENGTH,
	tagNameSchema,
} from "@/lib/trade-tag";

describe("tag names", () => {
	it("trims and collapses whitespace", () => {
		expect(normalizeTagName("  Late \t  entry\n")).toBe("Late entry");
	});

	it("treats names that differ only by case or spacing as one tag", () => {
		expect(sameTagName("late ENTRY", " Late  entry")).toBe(true);
		expect(sameTagName("Late entry", "Late exit")).toBe(false);
	});

	it("composes Unicode so visually equal names match", () => {
		expect(normalizeTagName("Cafe\u0301")).toBe("Caf\u00e9");
	});

	it("rejects blank and too-long names", () => {
		expect(tagNameSchema.safeParse("   ").success).toBe(false);
		expect(
			tagNameSchema.safeParse("x".repeat(TAG_NAME_MAX_LENGTH + 1)).success,
		).toBe(false);
		expect(tagNameSchema.parse("  FOMO ")).toBe("FOMO");
	});
});

describe("bulk edit input", () => {
	const input = (tradeIds: number[]) => ({
		portfolioId: 1,
		tradeIds,
		change: { action: BulkTradeAction.AddTags, tagIds: [1] },
	});

	it("removes duplicate trade ids", () => {
		expect(bulkEditSchema.parse(input([3, 3, 4])).tradeIds).toEqual([3, 4]);
	});

	it("caps the batch size with a clear message", () => {
		const ids = Array.from({ length: BULK_EDIT_LIMIT + 1 }, (_, i) => i + 1);
		const result = bulkEditSchema.safeParse(input(ids));
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].message).toContain(
			`up to ${BULK_EDIT_LIMIT} trades`,
		);
	});

	it("needs at least one trade and one tag", () => {
		expect(bulkEditSchema.safeParse(input([])).success).toBe(false);
		expect(
			bulkEditSchema.safeParse({
				...input([1]),
				change: { action: BulkTradeAction.RemoveTags, tagIds: [] },
			}).success,
		).toBe(false);
	});
});

describe("parseTagIds", () => {
	it("keeps positive ids once and ignores the rest", () => {
		expect(parseTagIds("3,abc,3,-1,7")).toEqual([3, 7]);
		expect(parseTagIds("")).toBeUndefined();
		expect(parseTagIds("x")).toBeUndefined();
	});
});
