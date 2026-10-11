import { describe, expect, it } from "vitest";
import { summarizeTrades, type TradeRecord } from "@/lib/analytics";
import { groupTradesByDay } from "@/lib/calendar-days";
import { toRealizations } from "@/lib/position";
import { buildRuleContext } from "@/lib/risk-rule-evaluation";
import { DailyLossUnit } from "@/lib/risk-rules";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { closedTrade } from "./trade-fixtures";

const MONDAY = "2026-09-07T10:00:00Z";
const WEDNESDAY = "2026-09-09T10:00:00Z";

const realizations = [
	{ at: new Date(MONDAY), amount: 120 },
	{ at: new Date(WEDNESDAY), amount: -20 },
];

const closedPosition: TradeRecord = {
	status: TradeStatus.Closed,
	entryDate: new Date("2026-09-04T09:00:00Z"),
	exitDate: new Date(WEDNESDAY),
	netPnl: 100,
	realizations,
};

const openPosition: TradeRecord = {
	status: TradeStatus.Open,
	entryDate: new Date("2026-09-04T09:00:00Z"),
	exitDate: null,
	netPnl: 0,
	realizations: [realizations[0]],
};

describe("toRealizations", () => {
	const exits = [
		{ executedAt: new Date(MONDAY), realizedPnl: "40.005" },
		{ executedAt: new Date(WEDNESDAY), realizedPnl: "60.01" },
	];

	it("gives each exit fill its stored P&L while the position is open", () => {
		expect(toRealizations(exits, null)).toEqual([
			{ at: new Date(MONDAY), amount: 40.005 },
			{ at: new Date(WEDNESDAY), amount: 60.01 },
		]);
	});

	it("makes the sum equal the net P&L of a closed position", () => {
		const result = toRealizations(exits, 100.02);
		expect(result.at(-1)?.amount).toBeCloseTo(60.015);
		expect(result.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(
			100.02,
		);
	});
});

describe("summarizeTrades with partial exits", () => {
	it("puts each exit on its own day and counts one trade at the final close", () => {
		const { stats, equityCurve } = summarizeTrades([closedPosition]);

		expect(equityCurve.map((point) => [point.date, point.balance])).toEqual([
			["2026-09-06", 0],
			["2026-09-07", 120],
			["2026-09-09", 100],
		]);
		expect(stats).toMatchObject({
			totalPnL: 100,
			totalBalance: 100,
			totalTrades: 1,
			winningTrades: 1,
		});
	});

	it("counts only the exits in the range for the cash view", () => {
		const { stats } = summarizeTrades([closedPosition], [], {
			from: new Date("2026-09-08T00:00:00Z"),
			to: null,
		});

		expect(stats).toMatchObject({
			openingBalance: 120,
			totalPnL: -20,
			totalBalance: 100,
			totalTrades: 1,
		});
	});

	it("adds the partial exits of an open position to the cash view only", () => {
		const { stats } = summarizeTrades([openPosition]);

		expect(stats).toMatchObject({
			totalPnL: 120,
			totalBalance: 120,
			totalTrades: 0,
			activeTrades: 1,
			winRate: null,
		});
	});

	it("gives the same result as before for trades without fills", () => {
		const legacy = [
			closedTrade("2026-09-01T09:00:00Z", "2026-09-02T09:00:00Z", 50),
			closedTrade("2026-09-03T09:00:00Z", "2026-09-03T12:00:00Z", -30),
		];
		const withEmpty = legacy.map((trade) => ({
			...trade,
			realizations: undefined,
		}));

		expect(summarizeTrades(withEmpty)).toEqual(summarizeTrades(legacy));
		expect(summarizeTrades(legacy).stats.totalPnL).toBe(20);
	});
});

describe("groupTradesByDay with partial exits", () => {
	const september = {
		from: new Date("2026-09-01T00:00:00Z"),
		to: new Date("2026-10-01T00:00:00Z"),
	};
	const base = {
		id: 7,
		symbol: "EURUSD",
		side: TradeSide.Long,
	};

	it("puts the P&L of each exit on its day and counts the trade at the final close", () => {
		const days = groupTradesByDay(
			[{ ...base, ...closedPosition, status: TradeStatus.Closed }],
			september,
			"UTC",
		);

		expect(Object.keys(days).sort()).toEqual(["2026-09-07", "2026-09-09"]);
		expect(days["2026-09-07"]).toMatchObject({ netPnl: 120, tradeCount: 0 });
		expect(days["2026-09-07"].trades[0]).toMatchObject({
			netPnl: 120,
			isPartialExit: true,
		});
		expect(days["2026-09-09"]).toMatchObject({ netPnl: -20, tradeCount: 1 });
		expect(days["2026-09-09"].trades[0].isPartialExit).toBeUndefined();
	});

	it("shows an open position on its entry day and on each partial exit day", () => {
		const days = groupTradesByDay(
			[{ ...base, ...openPosition, status: TradeStatus.Open, netPnl: null }],
			september,
			"UTC",
		);

		expect(days["2026-09-04"]).toMatchObject({ netPnl: 0, tradeCount: 1 });
		expect(days["2026-09-04"].trades[0].netPnl).toBeNull();
		expect(days["2026-09-07"]).toMatchObject({ netPnl: 120, tradeCount: 0 });
		expect(days["2026-09-07"].trades[0].isPartialExit).toBe(true);
	});

	it("joins the partial exits of one day into one row", () => {
		const days = groupTradesByDay(
			[
				{
					...base,
					...openPosition,
					status: TradeStatus.Open,
					netPnl: null,
					realizations: [
						{ at: new Date(MONDAY), amount: 50 },
						{ at: new Date("2026-09-07T11:00:00Z"), amount: 25 },
					],
				},
			],
			september,
			"UTC",
		);

		expect(days["2026-09-07"].trades).toHaveLength(1);
		expect(days["2026-09-07"]).toMatchObject({ netPnl: 75, tradeCount: 0 });
	});
});

describe("daily loss with partial exits", () => {
	const at = new Date("2026-09-07T15:00:00Z");
	const versions = [
		{
			version: 1,
			rules: {
				v: 1 as const,
				dailyLoss: { unit: DailyLossUnit.Amount, value: "500" },
			},
			timezone: "UTC",
			effectiveFrom: new Date("2026-01-01T00:00:00Z"),
		},
	];

	it("counts the partial exits realized today before the entry", () => {
		const context = buildRuleContext(
			{
				versions,
				currency: "USD",
				cashFlows: [],
				trades: [
					{
						status: TradeStatus.Open,
						entryDate: new Date("2026-09-04T09:00:00Z"),
						exitDate: null,
						netPnl: null,
						realizations: [
							{ at: new Date("2026-09-07T09:00:00Z"), amount: -300 },
							{ at: new Date("2026-09-07T16:00:00Z"), amount: -900 },
						],
					},
				],
			},
			at,
		);

		expect(context.realizedPnl).toBe(-300);
		expect(context.missingPnlCount).toBe(0);
		expect(context.enteredCount).toBe(0);
	});
});
