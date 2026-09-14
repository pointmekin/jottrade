import { describe, expect, it } from "vitest";
import {
	computeAvgHoldTime,
	computeAvgRR,
	computeMaxDrawdown,
	computeSharpe,
	groupByDay,
	summarizeTrades,
	type TradeRecord,
} from "../lib/analytics";

const t = (exitISO: string, entryISO: string, pnl: number) => ({
	exitDate: new Date(exitISO),
	entryDate: new Date(entryISO),
	netPnl: pnl,
});

describe("groupByDay", () => {
	it("sums P&L per exit date", () => {
		const trades = [
			t("2025-01-01T10:00:00Z", "2025-01-01T09:00:00Z", 100),
			t("2025-01-01T14:00:00Z", "2025-01-01T09:00:00Z", 50),
			t("2025-01-02T10:00:00Z", "2025-01-02T09:00:00Z", -30),
		];
		const result = groupByDay(trades);
		expect(result.get("2025-01-01")).toBe(150);
		expect(result.get("2025-01-02")).toBe(-30);
	});

	it("groups UTC instants by the user's local day", () => {
		const trades = [
			t("2025-01-03T16:30:00Z", "2025-01-03T15:00:00Z", 100),
			t("2025-01-03T18:00:00Z", "2025-01-03T17:00:00Z", 50),
		];
		const result = groupByDay(trades, "Asia/Bangkok");
		expect(Array.from(result.entries())).toEqual([
			["2025-01-03", 100],
			["2025-01-04", 50],
		]);
	});
});

describe("computeSharpe", () => {
	it("returns 0 for < 2 data points", () => {
		expect(computeSharpe(new Map([["2025-01-01", 100]]))).toBe(0);
	});
	it("returns 0 when stddev is 0", () => {
		expect(
			computeSharpe(
				new Map([
					["a", 100],
					["b", 100],
				]),
			),
		).toBe(0);
	});
	it("returns positive for consistently positive returns", () => {
		const map = new Map([
			["a", 100],
			["b", 200],
			["c", 150],
		]);
		expect(computeSharpe(map)).toBeGreaterThan(0);
	});
	it("uses sample stddev (n-1)", () => {
		// With 2 points [0, 100]: mean=50, sample stddev=70.71, sharpe = (50/70.71)*sqrt(252) ≈ 11.22
		const map = new Map([
			["a", 0],
			["b", 100],
		]);
		expect(computeSharpe(map)).toBeCloseTo(11.22, 0);
	});
});

describe("computeMaxDrawdown", () => {
	it("returns zeros for an empty curve", () => {
		expect(computeMaxDrawdown([])).toEqual({ dollars: 0, percent: 0 });
	});
	it("computes peak-to-trough correctly", () => {
		const curve = [
			{ date: "2024-12-31", balance: 10000 },
			{ date: "2025-01-01", balance: 11000 }, // peak
			{ date: "2025-01-02", balance: 9000 }, // dd 2000
			{ date: "2025-01-03", balance: 9500 },
		];
		const { dollars, percent } = computeMaxDrawdown(curve);
		expect(dollars).toBe(2000);
		expect(percent).toBeCloseTo(18.18, 1);
	});
	it("treats a deposit as a new peak, not a recovery", () => {
		const curve = [
			{ date: "2025-01-01", balance: 10000 },
			{ date: "2025-01-02", balance: 8000 }, // dd 2000
			{ date: "2025-01-03", balance: 18000 }, // deposit lifts the peak
			{ date: "2025-01-04", balance: 17000 },
		];
		expect(computeMaxDrawdown(curve).dollars).toBe(2000);
	});
});

describe("computeAvgRR", () => {
	it("returns 0 with no losses", () => {
		expect(
			computeAvgRR([t("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", 100)]),
		).toBe(0);
	});
	it("returns 0 with no wins", () => {
		expect(
			computeAvgRR([t("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", -100)]),
		).toBe(0);
	});
	it("computes ratio correctly", () => {
		const trades = [
			t("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", 200),
			t("2025-01-02T00:00:00Z", "2025-01-02T00:00:00Z", 100),
			t("2025-01-03T00:00:00Z", "2025-01-03T00:00:00Z", -100),
		];
		expect(computeAvgRR(trades)).toBe(1.5); // avgWin=150, avgLoss=100
	});
});

describe("summarizeTrades", () => {
	const closed = (
		entryISO: string,
		exitISO: string | null,
		pnl: number,
	): TradeRecord => ({
		status: "CLOSED",
		entryDate: new Date(entryISO),
		exitDate: exitISO ? new Date(exitISO) : null,
		netPnl: pnl,
	});

	const flow = (occurredISO: string, amount: number) => ({
		occurredAt: new Date(occurredISO),
		amount,
	});
	const adjustment = (occurredISO: string, amount: number) => ({
		occurredAt: new Date(occurredISO),
		amount,
		kind: "ADJUSTMENT" as const,
	});

	it("returns an empty curve and a zero balance with no trades or deposits", () => {
		const { stats, equityCurve } = summarizeTrades([]);
		expect(equityCurve).toEqual([]);
		expect(stats.totalTrades).toBe(0);
		expect(stats.winRate).toBe(0);
		expect(stats.profitFactor).toBeNull();
		expect(stats.totalBalance).toBe(0);
		expect(stats.netDeposits).toBe(0);
	});

	it("excludes breakeven trades from the win rate", () => {
		const { stats } = summarizeTrades([
			closed("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 100),
			closed("2025-01-02T09:00:00Z", "2025-01-02T10:00:00Z", -50),
			closed("2025-01-03T09:00:00Z", "2025-01-03T10:00:00Z", 0),
			closed("2025-01-04T09:00:00Z", "2025-01-04T10:00:00Z", 0),
		]);
		expect(stats.winningTrades).toBe(1);
		expect(stats.losingTrades).toBe(1);
		expect(stats.breakevenTrades).toBe(2);
		expect(stats.winRate).toBe(50);
	});

	it("counts only CLOSED trades as realized and OPEN trades as active", () => {
		const { stats } = summarizeTrades([
			closed("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 100),
			{
				status: "OPEN",
				entryDate: new Date("2025-01-02T09:00:00Z"),
				exitDate: null,
				netPnl: 0,
			},
			{
				status: "PENDING",
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
				closed("2025-01-01T09:00:00Z", "2025-01-05T10:00:00Z", -200),
				closed("2025-01-03T09:00:00Z", "2025-01-04T10:00:00Z", 500),
			],
			[flow("2024-12-01T00:00:00Z", 10000)],
			{ from: new Date("2025-01-01T00:00:00Z"), to: null },
		);
		expect(equityCurve).toEqual([
			{ date: "2025-01-03", balance: 10000 },
			{ date: "2025-01-04", balance: 10500 },
			{ date: "2025-01-05", balance: 10300 },
		]);
	});

	it("labels equity points with the user's local day", () => {
		const { equityCurve } = summarizeTrades(
			[closed("2025-01-03T15:00:00Z", "2025-01-03T16:30:00Z", 100)],
			[],
			undefined,
			"Asia/Bangkok",
		);
		expect(equityCurve).toEqual([
			{ date: "2025-01-02", balance: 0 },
			{ date: "2025-01-03", balance: 100 },
		]);
	});

	it("emits one point per day and ends at the final balance", () => {
		const trades = [
			closed("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 100),
			closed("2025-01-01T11:00:00Z", "2025-01-01T12:00:00Z", 50),
			closed("2025-01-02T09:00:00Z", "2025-01-02T10:00:00Z", -30),
		];
		const { stats, equityCurve } = summarizeTrades(
			trades,
			[flow("2024-12-01T00:00:00Z", 1000)],
			{ from: new Date("2025-01-01T00:00:00Z"), to: null },
		);
		expect(equityCurve).toHaveLength(3); // baseline + 2 trading days
		expect(equityCurve.at(-1)).toEqual({ date: "2025-01-02", balance: 1120 });
		expect(stats.openingBalance).toBe(1000);
		expect(stats.totalBalance).toBe(1120);
	});

	it("keeps a closed trade without an exit date on the curve", () => {
		const { stats, equityCurve } = summarizeTrades([
			closed("2025-01-01T09:00:00Z", null, 250),
		]);
		expect(stats.totalPnL).toBe(250);
		expect(equityCurve.at(-1)).toEqual({ date: "2025-01-01", balance: 250 });
	});

	it("reports profit factor as null when there is no loss", () => {
		const { stats } = summarizeTrades([
			closed("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 100),
		]);
		expect(stats.profitFactor).toBeNull();
		expect(stats.winRate).toBe(100);
	});

	it("computes profit factor from gross profit over gross loss", () => {
		const { stats } = summarizeTrades([
			closed("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 300),
			closed("2025-01-02T09:00:00Z", "2025-01-02T10:00:00Z", -100),
		]);
		expect(stats.profitFactor).toBe(3);
	});

	it("steps the curve on a deposit without counting it as P&L", () => {
		const { stats, equityCurve } = summarizeTrades(
			[closed("2025-01-03T09:00:00Z", "2025-01-03T10:00:00Z", 200)],
			[flow("2025-01-01T00:00:00Z", 5000), flow("2025-01-05T00:00:00Z", 1000)],
		);
		expect(equityCurve).toEqual([
			{ date: "2024-12-31", balance: 0 },
			{ date: "2025-01-01", balance: 5000 },
			{ date: "2025-01-03", balance: 5200 },
			{ date: "2025-01-05", balance: 6200 },
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
			[closed("2026-09-14T09:00:00Z", "2026-09-14T10:00:00Z", 100)],
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
		});
	});

	it("carries earlier deposits and P&L into the opening balance of a window", () => {
		const { stats } = summarizeTrades(
			[
				closed("2025-01-02T09:00:00Z", "2025-01-02T10:00:00Z", 300),
				closed("2025-02-10T09:00:00Z", "2025-02-10T10:00:00Z", -100),
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

	it("ignores trades and deposits after the window", () => {
		const { stats } = summarizeTrades(
			[closed("2025-03-01T09:00:00Z", "2025-03-01T10:00:00Z", 900)],
			[flow("2025-03-02T00:00:00Z", 1000)],
			{ from: null, to: new Date("2025-02-28T23:59:59Z") },
		);
		expect(stats.totalTrades).toBe(0);
		expect(stats.totalBalance).toBe(0);
	});
});

describe("computeAvgHoldTime", () => {
	it("returns 0 for empty", () => {
		expect(computeAvgHoldTime([])).toBe(0);
	});
	it("returns average hours", () => {
		const trades = [
			t("2025-01-01T10:00:00Z", "2025-01-01T08:00:00Z", 100), // 2h
			t("2025-01-02T12:00:00Z", "2025-01-02T08:00:00Z", 50), // 4h
		];
		expect(computeAvgHoldTime(trades)).toBe(3);
	});
});
