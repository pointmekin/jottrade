import { describe, expect, it } from "vitest";
import { summarizeGroup } from "@/lib/group-summary";
import { FINDING_MIN_TRADES, tagFindings } from "@/lib/insights";

const group = (key: string, pnls: number[]) => ({
	key,
	name: `Tag ${key}`,
	...summarizeGroup(pnls),
});

describe("tagFindings", () => {
	const enough = Array<number>(FINDING_MIN_TRADES).fill(-10);
	const scope = summarizeGroup([...enough, ...Array<number>(20).fill(30)]);

	it("returns the difference from the scope average for a tag with enough trades", () => {
		const [finding] = tagFindings([group("1", enough)], scope);
		expect(scope.avgPnl).toBe(10);
		expect(finding).toEqual({
			key: "1",
			name: "Tag 1",
			count: FINDING_MIN_TRADES,
			avgPnl: -10,
			difference: -20,
		});
	});

	it("returns no difference below the minimum sample", () => {
		const [finding] = tagFindings(
			[group("2", enough.slice(1))],
			summarizeGroup(enough),
		);
		expect(finding.count).toBe(FINDING_MIN_TRADES - 1);
		expect(finding.difference).toBeNull();
	});

	it("returns no finding for random data with no pattern", () => {
		const pnls = Array.from({ length: 40 }, (_, i) => (i % 2 ? 25 : -25));
		const [finding] = tagFindings([group("3", pnls)], summarizeGroup(pnls));
		expect(finding.difference).toBe(0);
	});
});
