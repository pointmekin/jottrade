import { describe, expect, it } from "vitest";
import { PlaybookCriterionKind } from "@/lib/playbook";
import {
	buildPlaybookCheck,
	CriterionResult,
	isPlaybookCheckStale,
	PlanAdherence,
	playbookCheckSchema,
} from "@/lib/playbook-check";
import { currentExecutionFingerprint } from "@/lib/review-execution-fingerprint";

const strategy = {
	id: 1,
	name: "Breakout",
	criteriaVersion: 2,
	criteria: [
		{
			id: "close",
			kind: PlaybookCriterionKind.Entry,
			text: "Price closes above the range high.",
			required: true,
		},
		{
			id: "volume",
			kind: PlaybookCriterionKind.Entry,
			text: "Volume is above average.",
			required: false,
		},
		{
			id: "fail",
			kind: PlaybookCriterionKind.Invalidation,
			text: "Price closes back inside the range.",
			required: true,
		},
	],
};
const CHECKED_AT = new Date("2026-10-09T08:00:00Z");
const build = (results: Record<string, CriterionResult>) =>
	buildPlaybookCheck(strategy, results, CHECKED_AT);

describe("buildPlaybookCheck", () => {
	it("follows the plan when every required criterion is followed", () => {
		const check = build({
			close: CriterionResult.Followed,
			fail: CriterionResult.Followed,
		});

		expect(check.result).toBe(PlanAdherence.Followed);
		expect(check.items.map((item) => item.result)).toEqual([
			CriterionResult.Followed,
			null,
			CriterionResult.Followed,
		]);
	});

	it("breaks the plan when a required criterion is broken, not an optional one", () => {
		expect(
			build({
				close: CriterionResult.Followed,
				volume: CriterionResult.Broke,
				fail: CriterionResult.Followed,
			}).result,
		).toBe(PlanAdherence.Followed);
		expect(
			build({ close: CriterionResult.Broke, fail: CriterionResult.Followed })
				.result,
		).toBe(PlanAdherence.Broken);
	});

	it("refuses a check with an unanswered required criterion", () => {
		expect(() => build({ close: CriterionResult.Followed })).toThrow(
			"Answer every required criterion.",
		);
	});

	it("refuses a playbook with no criteria", () => {
		expect(() =>
			buildPlaybookCheck({ ...strategy, criteria: [] }, {}, CHECKED_AT),
		).toThrow("This playbook has no criteria yet.");
	});

	it("copies the playbook into a snapshot that the schema reads back", () => {
		const check = build({
			close: CriterionResult.Followed,
			fail: CriterionResult.Broke,
		});

		expect(playbookCheckSchema.parse(check)).toEqual(check);
		expect(check).toMatchObject({
			v: 1,
			strategyId: 1,
			strategyName: "Breakout",
			criteriaVersion: 2,
			checkedAt: CHECKED_AT.toISOString(),
		});
		expect(check.items[0].text).toBe("Price closes above the range high.");
	});
});

describe("isPlaybookCheckStale", () => {
	const check = build({
		close: CriterionResult.Followed,
		fail: CriterionResult.Followed,
	});

	it("is current for the same strategy and version", () => {
		expect(isPlaybookCheckStale(check, 1, strategy)).toBe(false);
	});

	it("is stale after a criteria edit, a strategy change or a removed strategy", () => {
		expect(
			isPlaybookCheckStale(check, 1, { ...strategy, criteriaVersion: 3 }),
		).toBe(true);
		expect(isPlaybookCheckStale(check, 2, { ...strategy, id: 2 })).toBe(true);
		expect(isPlaybookCheckStale(check, null, null)).toBe(true);
	});
});

describe("execution fingerprint", () => {
	it("does not change when a playbook check is saved", async () => {
		const trade = { symbol: "AAPL", entryPrice: "100", quantity: "2" };
		const check = build({
			close: CriterionResult.Followed,
			fail: CriterionResult.Followed,
		});

		expect(
			await currentExecutionFingerprint({ ...trade, playbookCheck: check }),
		).toBe(await currentExecutionFingerprint(trade));
	});
});
