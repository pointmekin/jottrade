import { describe, expect, it } from "vitest";
import {
	closedTradesInRange,
	summarizeTrades,
	type TradeRecord,
} from "@/lib/analytics";
import { summarizeGroup, summarizeGroups } from "@/lib/group-summary";
import { TradeStatus } from "@/lib/trade";

describe("summarizeGroup", () => {
	it("excludes breakeven trades from the win rate, like the headline", () => {
		expect(summarizeGroup([100, -50, 0, 0])).toEqual({
			count: 4,
			wins: 1,
			losses: 1,
			breakeven: 2,
			totalPnl: 50,
			avgPnl: 12.5,
			winRate: 50,
		});
	});

	it("reports the win rate as unavailable for an empty group", () => {
		expect(summarizeGroup([]).winRate).toBeNull();
	});
});

describe("strategy reconciliation fixture", () => {
	type StrategyTrade = TradeRecord & { setupId: number | null };

	const BREAKOUT = 1;
	const PULLBACK = 2;
	const fixture: StrategyTrade[] = Array.from({ length: 80 }, (_, i) => {
		const exit = new Date(Date.UTC(2025, 0, 1 + i, 14));
		let setupId: number | null = BREAKOUT;
		if (i >= 60) setupId = i % 2 ? PULLBACK : null;
		return {
			status: TradeStatus.Closed,
			entryDate: new Date(exit.getTime() - 3_600_000),
			exitDate: exit,
			netPnl: (((i * 37) % 11) - 5) * 10,
			setupId,
		};
	});
	fixture.push({
		status: TradeStatus.Open,
		entryDate: new Date("2025-03-01T00:00:00Z"),
		exitDate: null,
		netPnl: 999,
		setupId: BREAKOUT,
	});

	/** The strategy page query: closed trades of one strategy, all time. */
	const strategyPage = (id: number) =>
		summarizeGroup(
			fixture
				.filter(
					(trade) =>
						trade.status === TradeStatus.Closed && trade.setupId === id,
				)
				.map((trade) => trade.netPnl),
		);

	const dashboard = summarizeGroups(
		closedTradesInRange(fixture),
		(trade) => trade.setupId,
		(trade) => trade.netPnl,
	);

	it("gives the strategy page every trade past the first page of 50", () => {
		expect(strategyPage(BREAKOUT).count).toBe(60);
	});

	it("gives the same strategy totals on the strategy page and the dashboard", () => {
		expect(strategyPage(BREAKOUT)).toEqual(dashboard.get(BREAKOUT));
		expect(strategyPage(PULLBACK)).toEqual(dashboard.get(PULLBACK));
	});

	it("sums the strategy groups to the headline totals", () => {
		const { stats } = summarizeTrades(fixture, [
			{ occurredAt: new Date("2024-12-01T00:00:00Z"), amount: 10000 },
		]);
		const groups = Array.from(dashboard.values());
		const sum = (pick: (group: (typeof groups)[number]) => number) =>
			groups.reduce((total, group) => total + pick(group), 0);

		expect(sum((group) => group.count)).toBe(stats.totalTrades);
		expect(sum((group) => group.totalPnl)).toBe(stats.totalPnL);
		expect(sum((group) => group.wins)).toBe(stats.winningTrades);
		expect(sum((group) => group.losses)).toBe(stats.losingTrades);
		expect(sum((group) => group.breakeven)).toBe(stats.breakevenTrades);
	});
});
