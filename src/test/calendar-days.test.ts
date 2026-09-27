import { describe, expect, it } from "vitest";
import { type CalendarTradeRow, groupTradesByDay } from "@/lib/calendar-days";
import { TradeSide, TradeStatus } from "@/lib/trade";

const september = {
	from: new Date("2026-09-01T00:00:00Z"),
	to: new Date("2026-10-01T00:00:00Z"),
};

function row(overrides: Partial<CalendarTradeRow>): CalendarTradeRow {
	return {
		id: 1,
		symbol: "EURUSD",
		side: TradeSide.Long,
		status: TradeStatus.Closed,
		netPnl: 100,
		entryDate: new Date("2026-09-10T09:00:00Z"),
		exitDate: new Date("2026-09-11T15:00:00Z"),
		...overrides,
	};
}

describe("groupTradesByDay", () => {
	it("puts a closed trade on its exit day with its P&L", () => {
		const days = groupTradesByDay([row({})], september, "UTC");

		expect(Object.keys(days)).toEqual(["2026-09-11"]);
		expect(days["2026-09-11"]).toMatchObject({ netPnl: 100, tradeCount: 1 });
	});

	it("puts a closed trade without an exit date on its entry day with its P&L", () => {
		const days = groupTradesByDay([row({ exitDate: null })], september, "UTC");

		expect(days["2026-09-10"]).toMatchObject({ netPnl: 100, tradeCount: 1 });
		expect(days["2026-09-10"].trades[0].netPnl).toBe(100);
	});

	it("puts an open trade on its entry day without P&L", () => {
		const days = groupTradesByDay(
			[row({ status: TradeStatus.Open, exitDate: null, netPnl: null })],
			september,
			"UTC",
		);

		expect(days["2026-09-10"]).toMatchObject({ netPnl: 0, tradeCount: 1 });
		expect(days["2026-09-10"].trades[0].netPnl).toBeNull();
	});

	it("adds no P&L for a trade that is not closed, like the dashboard", () => {
		const days = groupTradesByDay(
			[row({ status: TradeStatus.Open, netPnl: 40 })],
			september,
			"UTC",
		);

		expect(days["2026-09-10"]).toMatchObject({ netPnl: 0, tradeCount: 1 });
	});

	it("keeps a trade realized on the first instant of the next month out", () => {
		const days = groupTradesByDay(
			[
				row({ exitDate: new Date("2026-10-01T00:00:00Z") }),
				row({
					id: 2,
					exitDate: null,
					entryDate: new Date("2026-08-31T23:00:00Z"),
				}),
			],
			september,
			"UTC",
		);

		expect(days).toEqual({});
	});

	it("uses the time zone for the day key", () => {
		const days = groupTradesByDay(
			[row({ exitDate: new Date("2026-09-11T23:30:00Z") })],
			september,
			"Asia/Bangkok",
		);

		expect(Object.keys(days)).toEqual(["2026-09-12"]);
	});

	it("sums the P&L of closed trades on the same day", () => {
		const days = groupTradesByDay(
			[row({}), row({ id: 2, netPnl: -30 })],
			september,
			"UTC",
		);

		expect(days["2026-09-11"]).toMatchObject({ netPnl: 70, tradeCount: 2 });
	});
});
