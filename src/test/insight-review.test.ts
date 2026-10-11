import { describe, expect, it } from "vitest";
import {
	appendReviewLine,
	insightReviewLine,
	sessionFindingText,
	sizingFindingText,
	tagFindingText,
} from "@/lib/insight-review";
import { SESSION_WINDOWS } from "@/lib/insights";

describe("insight review lines", () => {
	it("writes the finding text with its sample size", () => {
		expect(
			tagFindingText(
				{ key: "1", name: "FOMO", count: 24, avgPnl: -8.5, difference: -18.5 },
				"USD",
			),
		).toBe('Tag "FOMO": -$18.50 per trade against the scope avg (24 trades).');
		expect(
			sizingFindingText({
				afterLoss: { tradeIds: [1], withRisk: 21, medianRisk: 150 },
				other: { tradeIds: [2], withRisk: 30, medianRisk: 100 },
				change: 50,
			}),
		).toBe(
			"Sizing after a loss: +50% median initial risk (21 trades after a loss).",
		);
		expect(
			sessionFindingText(
				{
					...SESSION_WINDOWS[0],
					tradeIds: [1],
					count: 1,
					avgPnl: 3,
					difference: 2,
				},
				"EUR",
			),
		).toBe("Asia session: +€2.00 per trade against the scope avg (1 trade).");
	});

	it("adds the scope link to the line", () => {
		expect(insightReviewLine("Text.", "/journal?status=CLOSED")).toBe(
			"- Text. Trades: /journal?status=CLOSED",
		);
	});

	it("appends a line and keeps the existing text", () => {
		expect(appendReviewLine("", "- a")).toBe("- a");
		expect(appendReviewLine("Size down.", "- a")).toBe("Size down.\n- a");
	});

	it("does not add the same line twice", () => {
		expect(appendReviewLine("Size down.\n- a", "- a")).toBe("Size down.\n- a");
	});
});
