import { describe, expect, it } from "vitest";
import {
	MAX_CRITERIA_PER_KIND,
	PlaybookCriterionKind,
	playbookFieldsSchema,
} from "@/lib/playbook";

const criterion = (
	index: number,
	kind: PlaybookCriterionKind = PlaybookCriterionKind.Entry,
) => ({ id: `c${index}`, kind, text: `Rule ${index}`, required: true });

const fields = (criteria: unknown[]) => ({ name: "Breakout", criteria });

describe("playbookFieldsSchema", () => {
	it("accepts the maximum number of criteria in each list", () => {
		const entry = Array.from({ length: MAX_CRITERIA_PER_KIND }, (_, i) =>
			criterion(i),
		);
		const invalidation = Array.from({ length: MAX_CRITERIA_PER_KIND }, (_, i) =>
			criterion(i + 100, PlaybookCriterionKind.Invalidation),
		);

		expect(
			playbookFieldsSchema.safeParse(fields([...entry, ...invalidation]))
				.success,
		).toBe(true);
	});

	it("rejects one criterion more than the maximum in a list", () => {
		const entry = Array.from({ length: MAX_CRITERIA_PER_KIND + 1 }, (_, i) =>
			criterion(i),
		);

		const result = playbookFieldsSchema.safeParse(fields(entry));

		expect(result.error?.issues[0].message).toBe(
			"Use 20 criteria or fewer in each list.",
		);
	});

	it("trims the criterion text and rejects a blank or long text", () => {
		const parse = (text: string) =>
			playbookFieldsSchema.safeParse(fields([{ ...criterion(1), text }]));

		expect(parse("  Close above the range  ").data?.criteria[0].text).toBe(
			"Close above the range",
		);
		expect(parse("   ").success).toBe(false);
		expect(parse("x".repeat(201)).success).toBe(false);
	});

	it("rejects an unknown criterion kind and long risk guidance", () => {
		expect(
			playbookFieldsSchema.safeParse(
				fields([{ ...criterion(1), kind: "exit" }]),
			).success,
		).toBe(false);
		expect(
			playbookFieldsSchema.safeParse({
				...fields([]),
				riskGuidance: "x".repeat(1001),
			}).success,
		).toBe(false);
	});
});

describe("criterion ids", () => {
	it("rejects two criteria with the same id, in one list or across lists", () => {
		const twin = {
			...criterion(1),
			kind: PlaybookCriterionKind.Invalidation,
		};

		const result = playbookFieldsSchema.safeParse(fields([criterion(1), twin]));

		expect(result.error?.issues[0].message).toBe(
			"Each criterion needs its own id.",
		);
	});
});
