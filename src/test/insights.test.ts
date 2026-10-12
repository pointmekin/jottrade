import { describe, expect, it } from "vitest";
import {
	findInsights,
	InsightFormula,
	MIN_COHORT_TRADES,
} from "@/lib/insights";
import { ChartGroup } from "@/lib/journal-search";
import { TagColor, type TradeTag } from "@/lib/trade-tag";
import { sessionOf, TradingSession } from "@/lib/trading-session";

const CONTEXT = {
	portfolioId: 4,
	period: { from: "2026-03-01T00:00:00.000Z", to: null },
};
const FOMO: TradeTag = { id: 7, name: "FOMO", color: TagColor.Pink };

const at = (utcHour: number) =>
	new Date(`2026-03-02T${String(utcHour).padStart(2, "0")}:30:00Z`);

const trade = (id: number, netPnl: number, utcHour = 10) => ({
	id,
	netPnl,
	entryDate: at(utcHour),
});

/** A fixed-seed generator, so the random data is the same on each run. */
function seededRandom(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
		return state / 2 ** 31;
	};
}

describe("findInsights", () => {
	it("finds a synthetic tag pattern with the cohort ids, formula, samples, period and account", () => {
		const tagged = Array.from({ length: 20 }, (_, i) => trade(i + 1, -50));
		const others = Array.from({ length: 20 }, (_, i) => trade(i + 21, 30));
		const trades = [...tagged, ...others];
		const tagsByTrade = new Map(tagged.map((t) => [t.id, [FOMO]]));

		const [tag] = findInsights(trades, tagsByTrade, CONTEXT);

		expect(tag).toMatchObject({
			formula: InsightFormula.TagAvgPnlVsScope,
			group: ChartGroup.Tag,
			key: "7",
			name: "FOMO",
			portfolioId: 4,
			period: CONTEXT.period,
			sample: 20,
			cohort: { count: 20, avgPnl: -50, totalPnl: -1000 },
			comparison: { count: 40, avgPnl: -10, totalPnl: -400 },
			difference: -40,
		});
		expect(tag.cohort.tradeIds).toEqual(tagged.map((t) => t.id));
		expect(tag.comparison.tradeIds).toEqual(trades.map((t) => t.id));
	});

	it("finds a synthetic session pattern by the UTC entry time", () => {
		const asia = Array.from({ length: 20 }, (_, i) => trade(i + 1, 80, 3));
		const london = Array.from({ length: 20 }, (_, i) => trade(i + 21, 0, 9));

		const insights = findInsights([...asia, ...london], new Map(), CONTEXT);

		expect(
			insights.map(({ formula, key, difference }) => ({
				formula,
				key,
				difference,
			})),
		).toEqual([
			{
				formula: InsightFormula.SessionAvgPnlVsScope,
				key: TradingSession.Asia,
				difference: 40,
			},
			{
				formula: InsightFormula.SessionAvgPnlVsScope,
				key: TradingSession.London,
				difference: -40,
			},
		]);
	});

	it("finds nothing in random data where each cohort has fewer than 20 trades", () => {
		const random = seededRandom(22);
		const hours = [2, 10, 15, 22];
		const trades = Array.from({ length: 60 }, (_, i) =>
			trade(i + 1, Math.round((random() - 0.5) * 400), hours[i % 4]),
		);
		const tagsByTrade = new Map(
			trades.filter(() => random() < 0.25).map((t) => [t.id, [FOMO]]),
		);

		const insights = findInsights(trades, tagsByTrade, CONTEXT);

		expect(insights).toHaveLength(5);
		for (const insight of insights) {
			expect(insight.sample).toBeLessThan(MIN_COHORT_TRADES);
			expect(insight.difference, insight.name).toBeNull();
		}
	});

	it("needs 20 trades in each cohort", () => {
		const trades = Array.from({ length: 19 }, (_, i) => trade(i + 1, 10, 3));
		const [small] = findInsights(trades, new Map(), CONTEXT);
		const [enough] = findInsights(
			[...trades, trade(20, 10, 3)],
			new Map(),
			CONTEXT,
		);

		expect(small).toMatchObject({ sample: 19, difference: null });
		expect(enough).toMatchObject({ sample: 20, difference: 0 });
	});

	it("leaves out the tag cohorts under a tag filter and empty sessions", () => {
		const trades = [trade(1, 10, 3)];

		expect(findInsights(trades, null, CONTEXT).map((i) => i.key)).toEqual([
			TradingSession.Asia,
		]);
		expect(findInsights([], null, CONTEXT)).toEqual([]);
	});
});

describe("sessionOf", () => {
	it.each([
		["00:00", TradingSession.Asia],
		["07:59", TradingSession.Asia],
		["08:00", TradingSession.London],
		["12:59", TradingSession.London],
		["13:00", TradingSession.NewYork],
		["20:59", TradingSession.NewYork],
		["21:00", TradingSession.Other],
		["23:59", TradingSession.Other],
	])("puts an entry at %s UTC in %s", (time, session) => {
		expect(sessionOf(new Date(`2026-03-02T${time}:00Z`))).toBe(session);
	});
});
