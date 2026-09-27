import { describe, expect, it } from "vitest";
import { AccountEntryKind } from "@/lib/account-entry";
import { summarizeTrades } from "@/lib/analytics";
import { computeMaxDrawdown } from "@/lib/risk-metrics";
import { TradeStatus } from "@/lib/trade";
import { closedTrade } from "./trade-fixtures";

describe("summarizeTrades", () => {
	const flow = (occurredISO: string, amount: number) => ({
		occurredAt: new Date(occurredISO),
		amount,
	});
	const adjustment = (occurredISO: string, amount: number) => ({
		occurredAt: new Date(occurredISO),
		amount,
		kind: AccountEntryKind.Adjustment,
	});

	it("returns an empty curve and a zero balance with no trades or deposits", () => {
		const { stats, equityCurve } = summarizeTrades([]);
		expect(equityCurve).toEqual([]);
		expect(stats.totalTrades).toBe(0);
		expect(stats.winRate).toBeNull();
		expect(stats.profitFactor).toBeNull();
		expect(stats.totalBalance).toBe(0);
		expect(stats.netDeposits).toBe(0);
	});

	it("excludes breakeven trades from the win rate", () => {
		const { stats } = summarizeTrades([
			closedTrade("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 100),
			closedTrade("2025-01-02T09:00:00Z", "2025-01-02T10:00:00Z", -50),
			closedTrade("2025-01-03T09:00:00Z", "2025-01-03T10:00:00Z", 0),
			closedTrade("2025-01-04T09:00:00Z", "2025-01-04T10:00:00Z", 0),
		]);
		expect(stats.winningTrades).toBe(1);
		expect(stats.losingTrades).toBe(1);
		expect(stats.breakevenTrades).toBe(2);
		expect(stats.winRate).toBe(50);
	});

	it("counts only CLOSED trades as realized and OPEN trades as active", () => {
		const { stats } = summarizeTrades([
			closedTrade("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 100),
			{
				status: TradeStatus.Open,
				entryDate: new Date("2025-01-02T09:00:00Z"),
				exitDate: null,
				netPnl: 0,
			},
			{
				status: TradeStatus.Pending,
				entryDate: new Date("2025-01-03T09:00:00Z"),
				exitDate: null,
				netPnl: 0,
			},
		]);
		expect(stats.totalTrades).toBe(1);
		expect(stats.activeTrades).toBe(1);
		expect(stats.totalPnL).toBe(100);
	});

	it("orders the curve by exit date, not entry date", () => {
		const { equityCurve } = summarizeTrades(
			[
				closedTrade("2025-01-01T09:00:00Z", "2025-01-05T10:00:00Z", -200),
				closedTrade("2025-01-03T09:00:00Z", "2025-01-04T10:00:00Z", 500),
			],
			[flow("2024-12-01T00:00:00Z", 10000)],
			{ from: new Date("2025-01-01T00:00:00Z"), to: null },
		);
		expect(equityCurve).toEqual([
			{ date: "2025-01-03", balance: 10000, performance: 0 },
			{ date: "2025-01-04", balance: 10500, performance: 500 },
			{ date: "2025-01-05", balance: 10300, performance: 300 },
		]);
	});

	it("labels equity points with the user's local day", () => {
		const { equityCurve } = summarizeTrades(
			[closedTrade("2025-01-03T15:00:00Z", "2025-01-03T16:30:00Z", 100)],
			[],
			undefined,
			"Asia/Bangkok",
		);
		expect(equityCurve).toEqual([
			{ date: "2025-01-02", balance: 0, performance: 0 },
			{ date: "2025-01-03", balance: 100, performance: 100 },
		]);
	});

	it("emits one point per day and ends at the final balance", () => {
		const trades = [
			closedTrade("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 100),
			closedTrade("2025-01-01T11:00:00Z", "2025-01-01T12:00:00Z", 50),
			closedTrade("2025-01-02T09:00:00Z", "2025-01-02T10:00:00Z", -30),
		];
		const { stats, equityCurve } = summarizeTrades(
			trades,
			[flow("2024-12-01T00:00:00Z", 1000)],
			{ from: new Date("2025-01-01T00:00:00Z"), to: null },
		);
		expect(equityCurve).toHaveLength(3); // baseline + 2 trading days
		expect(equityCurve.at(-1)).toEqual({
			date: "2025-01-02",
			balance: 1120,
			performance: 120,
		});
		expect(stats.openingBalance).toBe(1000);
		expect(stats.totalBalance).toBe(1120);
	});

	it("keeps a closed trade without an exit date on the curve", () => {
		const { stats, equityCurve } = summarizeTrades([
			closedTrade("2025-01-01T09:00:00Z", null, 250),
		]);
		expect(stats.totalPnL).toBe(250);
		expect(equityCurve.at(-1)).toEqual({
			date: "2025-01-01",
			balance: 250,
			performance: 250,
		});
	});

	it("reports profit factor as null when there is no loss", () => {
		const { stats } = summarizeTrades([
			closedTrade("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 100),
		]);
		expect(stats.profitFactor).toBeNull();
		expect(stats.winRate).toBe(100);
	});

	it("computes profit factor from gross profit over gross loss", () => {
		const { stats } = summarizeTrades([
			closedTrade("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 300),
			closedTrade("2025-01-02T09:00:00Z", "2025-01-02T10:00:00Z", -100),
		]);
		expect(stats.profitFactor).toBe(3);
	});

	it("steps the curve on a deposit without counting it as P&L", () => {
		const { stats, equityCurve } = summarizeTrades(
			[closedTrade("2025-01-03T09:00:00Z", "2025-01-03T10:00:00Z", 200)],
			[flow("2025-01-01T00:00:00Z", 5000), flow("2025-01-05T00:00:00Z", 1000)],
		);
		expect(equityCurve).toEqual([
			{ date: "2024-12-31", balance: 0, performance: 0 },
			{ date: "2025-01-01", balance: 5000, performance: 0 },
			{ date: "2025-01-03", balance: 5200, performance: 200 },
			{ date: "2025-01-05", balance: 6200, performance: 200 },
		]);
		expect(stats.totalPnL).toBe(200);
		expect(stats.netDeposits).toBe(6000);
		expect(stats.totalBalance).toBe(6200);
	});

	it("subtracts a withdrawal from the balance", () => {
		const { stats } = summarizeTrades(
			[],
			[flow("2025-01-01T00:00:00Z", 5000), flow("2025-01-09T00:00:00Z", -2000)],
		);
		expect(stats.netDeposits).toBe(3000);
		expect(stats.totalBalance).toBe(3000);
	});

	it("counts an account adjustment as P&L without changing trade statistics", () => {
		const { stats, equityCurve } = summarizeTrades(
			[closedTrade("2026-09-14T09:00:00Z", "2026-09-14T10:00:00Z", 100)],
			[
				{ ...flow("2026-09-01T00:00:00Z", 1000), kind: "DEPOSIT" },
				adjustment("2026-09-14T21:00:00Z", -4.5),
			],
		);

		expect(stats.netDeposits).toBe(1000);
		expect(stats.totalPnL).toBe(95.5);
		expect(stats.totalTrades).toBe(1);
		expect(stats.winningTrades).toBe(1);
		expect(equityCurve.at(-1)).toEqual({
			date: "2026-09-14",
			balance: 1095.5,
			performance: 95.5,
		});
	});

	it("carries earlier deposits and P&L into the opening balance of a window", () => {
		const { stats } = summarizeTrades(
			[
				closedTrade("2025-01-02T09:00:00Z", "2025-01-02T10:00:00Z", 300),
				closedTrade("2025-02-10T09:00:00Z", "2025-02-10T10:00:00Z", -100),
			],
			[flow("2025-01-01T00:00:00Z", 5000)],
			{
				from: new Date("2025-02-01T00:00:00Z"),
				to: new Date("2025-02-28T23:59:59Z"),
			},
		);
		expect(stats.openingBalance).toBe(5300);
		expect(stats.netDeposits).toBe(0);
		expect(stats.totalPnL).toBe(-100);
		expect(stats.totalTrades).toBe(1);
		expect(stats.totalBalance).toBe(5200);
	});

	it("reports the win rate as unavailable when every trade is breakeven", () => {
		const { stats } = summarizeTrades([
			closedTrade("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 0),
		]);
		expect(stats.winRate).toBeNull();
		expect(stats.breakevenTrades).toBe(1);
	});

	it("changes the cash balance but not trading profit on a pure deposit and withdrawal", () => {
		const { stats, equityCurve } = summarizeTrades(
			[],
			[flow("2025-01-01T00:00:00Z", 5000), flow("2025-01-09T00:00:00Z", -2000)],
		);
		expect(stats.totalBalance).toBe(3000);
		expect(stats.totalPnL).toBe(0);
		expect(equityCurve.map((p) => p.performance)).toEqual([0, 0, 0]);
		expect(computeMaxDrawdown(equityCurve).dollars).toBe(0);
	});

	it("ignores trades and deposits after the window", () => {
		const { stats } = summarizeTrades(
			[closedTrade("2025-03-01T09:00:00Z", "2025-03-01T10:00:00Z", 900)],
			[flow("2025-03-02T00:00:00Z", 1000)],
			{ from: null, to: new Date("2025-02-28T23:59:59Z") },
		);
		expect(stats.totalTrades).toBe(0);
		expect(stats.totalBalance).toBe(0);
	});
});
