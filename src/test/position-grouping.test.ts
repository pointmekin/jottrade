import { describe, expect, it } from "vitest";
import { positionTotals, replayPosition } from "@/lib/position";
import {
	type BrokerLeg,
	groupedNotes,
	groupingError,
	legFills,
	SUGGESTION_REASON,
	suggestGroups,
} from "@/lib/position-grouping";
import { TradeSide, TradeStatus } from "@/lib/trade";

const at = (hour: number) => new Date(Date.UTC(2026, 8, 1, hour));

const leg = (id: number, overrides: Partial<BrokerLeg> = {}): BrokerLeg => ({
	id,
	portfolioId: 1,
	symbol: "EURUSD",
	side: TradeSide.Long,
	status: TradeStatus.Closed,
	entryDate: at(8),
	entryPrice: "1.1000",
	quantity: "0.10",
	exitDate: at(10),
	exitPrice: "1.1050",
	fees: "0.70",
	netPnl: "51.30",
	brokerTicket: String(9000 + id),
	importHash: `hash-${id}`,
	groupedIntoId: null,
	...overrides,
});

describe("suggestGroups", () => {
	it("suggests closed broker rows with the same symbol, side, open time and open price", () => {
		const rows = [
			leg(1),
			leg(2, { exitDate: at(12), netPnl: "-10.00" }),
			leg(3, { entryPrice: "1.1001" }),
			leg(4, { side: TradeSide.Short }),
			leg(5, { portfolioId: 2 }),
			leg(6, { entryDate: at(9) }),
		];

		expect(suggestGroups(rows)).toEqual([
			{ tradeIds: [1, 2], reason: SUGGESTION_REASON },
		]);
	});

	it("skips grouped, open, manual and single rows", () => {
		const rows = [
			leg(1),
			leg(2, { groupedIntoId: 99 }),
			leg(3, { status: TradeStatus.Open, exitPrice: null, exitDate: null }),
			leg(4, { importHash: null }),
		];

		expect(suggestGroups(rows)).toEqual([]);
	});
});

describe("groupingError", () => {
	it.each([
		[[leg(1)], "Select two or more broker rows."],
		[
			[leg(1), leg(2, { importHash: null })],
			"Only imported broker rows can be grouped.",
		],
		[
			[leg(1), leg(2, { groupedIntoId: 7 })],
			"A row is already grouped into a position.",
		],
		[
			[leg(1), leg(2, { status: TradeStatus.Open })],
			"Only closed broker rows can be grouped.",
		],
		[[leg(1), leg(2, { portfolioId: 2 })], "Rows are in different accounts."],
		[[leg(1), leg(2, { symbol: "GBPUSD" })], "Rows have different symbols."],
		[[leg(1), leg(2, { side: TradeSide.Short })], "Rows have different sides."],
	])("refuses %#", (rows, message) => {
		expect(groupingError(rows)).toBe(message);
	});

	it("accepts rows with different open times for a manual group", () => {
		expect(groupingError([leg(1), leg(2, { entryDate: at(9) })])).toBeNull();
	});
});

describe("legFills", () => {
	it("keeps the broker net P&L of each leg as the position total", () => {
		const legs = [
			leg(1, { netPnl: "51.30" }),
			leg(2, {
				quantity: "0.20",
				exitDate: at(12),
				exitPrice: "1.0980",
				netPnl: "-41.40",
			}),
		];

		const replay = replayPosition(TradeSide.Long, legFills(legs), {
			symbol: "EURUSD",
			accountCurrency: "USD",
		});
		if (!replay.ok) throw new Error(replay.error);
		const totals = positionTotals(TradeSide.Long, replay.steps);

		expect(replay.steps.map((step) => step.remainingQty)).toEqual([
			0.1, 0.3, 0.2, 0,
		]);
		expect(replay.steps.map((step) => step.realizedPnl)).toEqual([
			null,
			null,
			51.3,
			-41.4,
		]);
		expect(totals).toMatchObject({
			quantity: "0.3",
			entryPrice: "1.1",
			fees: "1.4",
			netPnl: "9.90",
			status: TradeStatus.Closed,
			exitDate: at(12),
		});
	});

	it("puts the entries before an exit at the same time", () => {
		const legs = [
			leg(1, { exitDate: at(9) }),
			leg(2, { entryDate: at(9), exitDate: at(11) }),
		];

		const replay = replayPosition(TradeSide.Long, legFills(legs), {
			symbol: "EURUSD",
			accountCurrency: "USD",
		});

		expect(replay.ok).toBe(true);
	});
});

describe("groupedNotes", () => {
	it("joins the leg notes under a ticket header", () => {
		expect(
			groupedNotes([
				{ ...leg(1), notes: "Scaled out at target 1" },
				{ ...leg(2), notes: null },
				{ ...leg(3), notes: " Runner " },
			]),
		).toBe("Ticket 9001:\nScaled out at target 1\n\nTicket 9003:\nRunner");
		expect(groupedNotes([{ ...leg(1), notes: "" }])).toBeNull();
	});
});
