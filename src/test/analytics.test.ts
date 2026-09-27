import { describe, expect, it } from "vitest";
import {
	closedTradesInRange,
	computeAccountReturn,
	computeAvgHoldTime,
	computeMaxDrawdown,
	computePayoffRatio,
	computeSharpe,
	type EquityPoint,
	MIN_SHARPE_DAYS,
	summarizeGroup,
	summarizeGroups,
	summarizeTrades,
	type TradeRecord,
} from "../lib/analytics";

const t = (exitISO: string, entryISO: string, pnl: number) => ({
	exitDate: new Date(exitISO),
	entryDate: new Date(entryISO),
	netPnl: pnl,
});

const point = (
	date: string,
	balance: number,
	performance: number,
): EquityPoint => ({ date, balance, performance });

/** Consecutive weekday points from Monday 2025-01-06, with no cash flows. */
function weekdayCurve(openingBalance: number, dailyPnls: number[]) {
	const curve = [point("2025-01-03", openingBalance, 0)];
	const day = new Date("2025-01-06T00:00:00Z");
	let performance = 0;
	for (const pnl of dailyPnls) {
		performance += pnl;
		curve.push(
			point(
				day.toISOString().slice(0, 10),
				openingBalance + performance,
				performance,
			),
		);
		day.setUTCDate(day.getUTCDate() + (day.getUTCDay() === 5 ? 3 : 1));
	}
	return curve;
}

function annualizedSharpe(returns: number[]): number {
	const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
	const variance =
		returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
	return (mean / Math.sqrt(variance)) * Math.sqrt(252);
}

describe("computeSharpe", () => {
	it("is unavailable, not zero, for a single day", () => {
		expect(computeSharpe(weekdayCurve(10000, [100]))).toEqual({
			value: null,
			days: 1,
		});
	});

	it("is unavailable below the minimum sample and reports the day count", () => {
		const pnls = Array.from({ length: MIN_SHARPE_DAYS - 1 }, (_, i) =>
			i % 2 ? -50 : 100,
		);
		expect(computeSharpe(weekdayCurve(10000, pnls))).toEqual({
			value: null,
			days: MIN_SHARPE_DAYS - 1,
		});
	});

	it("annualizes daily returns on the capital at the start of each day", () => {
		const pnls = Array.from({ length: 24 }, (_, i) => (i % 3 ? 120 : -80));
		const returns: number[] = [];
		let capital = 10000;
		for (const pnl of pnls) {
			returns.push(pnl / capital);
			capital += pnl;
		}

		const result = computeSharpe(weekdayCurve(10000, pnls));

		expect(result.days).toBe(24);
		expect(result.value).toBeCloseTo(annualizedSharpe(returns), 10);
	});

	it("does not change when P&L and capital scale together", () => {
		const pnls = Array.from({ length: 24 }, (_, i) => (i % 3 ? 120 : -80));
		const small = computeSharpe(weekdayCurve(10000, pnls)).value;
		const large = computeSharpe(
			weekdayCurve(
				100000,
				pnls.map((pnl) => pnl * 10),
			),
		).value;
		expect(large).toBeCloseTo(small as number, 10);
	});

	it("counts idle weekdays as zero-return days and skips idle weekends", () => {
		const result = computeSharpe([
			point("2025-01-05", 10000, 0),
			point("2025-01-06", 10100, 100),
			point("2025-01-13", 10050, 50),
		]);
		expect(result.days).toBe(6);
	});

	it("counts idle weekdays after the last active day up to the window end", () => {
		const curve = [
			point("2025-01-05", 10000, 0),
			point("2025-01-06", 10100, 100),
		];
		expect(computeSharpe(curve).days).toBe(1);
		expect(computeSharpe(curve, "2025-01-12").days).toBe(5);
		expect(computeSharpe(curve, "2025-01-06").days).toBe(1);
		expect(computeSharpe(curve, "2025-01-01").days).toBe(1);
	});

	it("does not extend to the window end without positive capital", () => {
		const curve = [point("2025-01-05", 100, 0), point("2025-01-06", 0, -100)];
		expect(computeSharpe(curve, "2025-01-10").days).toBe(1);
	});

	it("excludes days without positive capital", () => {
		const result = computeSharpe([
			point("2024-12-31", 0, 0),
			point("2025-01-01", -100, -100),
			point("2025-01-02", -50, -50),
		]);
		expect(result.days).toBe(0);
	});

	it("uses a same-day deposit as capital for that day", () => {
		const result = computeSharpe([
			point("2024-12-31", 0, 0),
			point("2025-01-01", 5100, 100),
		]);
		expect(result.days).toBe(1);
	});

	it("is unavailable when every return is equal", () => {
		const result = computeSharpe(
			weekdayCurve(10000, Array(MIN_SHARPE_DAYS).fill(0)),
		);
		expect(result).toEqual({ value: null, days: MIN_SHARPE_DAYS });
	});
});

describe("computeMaxDrawdown", () => {
	it("returns zeros for an empty curve", () => {
		expect(computeMaxDrawdown([])).toEqual({ dollars: 0, percent: 0 });
	});

	it("computes peak-to-trough correctly", () => {
		const { dollars, percent } = computeMaxDrawdown([
			point("2024-12-31", 10000, 0),
			point("2025-01-01", 11000, 1000),
			point("2025-01-02", 9000, -1000),
			point("2025-01-03", 9500, -500),
		]);
		expect(dollars).toBe(2000);
		expect(percent).toBeCloseTo(18.18, 1);
	});

	it("does not treat a withdrawal as a drawdown", () => {
		const { dollars } = computeMaxDrawdown([
			point("2024-12-31", 10000, 0),
			point("2025-01-01", 6000, 0),
			point("2025-01-02", 6100, 100),
		]);
		expect(dollars).toBe(0);
	});

	it("does not let a deposit hide a trading loss", () => {
		const { dollars, percent } = computeMaxDrawdown([
			point("2025-01-01", 10000, 0),
			point("2025-01-02", 8000, -2000),
			point("2025-01-03", 18000, -2000),
			point("2025-01-04", 17000, -3000),
		]);
		expect(dollars).toBe(3000);
		expect(percent).toBe(15);
	});

	it("reports the percent as unavailable when the peak balance is not positive", () => {
		expect(
			computeMaxDrawdown([
				point("2024-12-31", 0, 0),
				point("2025-01-01", -100, -100),
			]),
		).toEqual({ dollars: 100, percent: null });
	});
});

describe("computePayoffRatio", () => {
	it("is unavailable, not zero, with no losses", () => {
		expect(
			computePayoffRatio([
				t("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", 100),
			]).ratio,
		).toBeNull();
	});

	it("is unavailable, not zero, with no wins", () => {
		expect(
			computePayoffRatio([
				t("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", -100),
			]).ratio,
		).toBeNull();
	});

	it("divides the average win by the absolute average loss and ignores breakeven", () => {
		expect(
			computePayoffRatio([
				t("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", 200),
				t("2025-01-02T00:00:00Z", "2025-01-02T00:00:00Z", 100),
				t("2025-01-03T00:00:00Z", "2025-01-03T00:00:00Z", -100),
				t("2025-01-04T00:00:00Z", "2025-01-04T00:00:00Z", 0),
			]),
		).toEqual({ ratio: 1.5, avgWin: 150, avgLoss: 100, wins: 2, losses: 1 });
	});
});

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
			status: "CLOSED",
			entryDate: new Date(exit.getTime() - 3_600_000),
			exitDate: exit,
			netPnl: (((i * 37) % 11) - 5) * 10,
			setupId,
		};
	});
	fixture.push({
		status: "OPEN",
		entryDate: new Date("2025-03-01T00:00:00Z"),
		exitDate: null,
		netPnl: 999,
		setupId: BREAKOUT,
	});

	/** The strategy page query: closed trades of one strategy, all time. */
	const strategyPage = (id: number) =>
		summarizeGroup(
			fixture
				.filter((trade) => trade.status === "CLOSED" && trade.setupId === id)
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
		expect(stats.winRate).toBeNull();
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
			{ date: "2025-01-03", balance: 10000, performance: 0 },
			{ date: "2025-01-04", balance: 10500, performance: 500 },
			{ date: "2025-01-05", balance: 10300, performance: 300 },
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
			{ date: "2025-01-02", balance: 0, performance: 0 },
			{ date: "2025-01-03", balance: 100, performance: 100 },
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
			closed("2025-01-01T09:00:00Z", null, 250),
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
			performance: 95.5,
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

	it("reports the win rate as unavailable when every trade is breakeven", () => {
		const { stats } = summarizeTrades([
			closed("2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z", 0),
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
			[closed("2025-03-01T09:00:00Z", "2025-03-01T10:00:00Z", 900)],
			[flow("2025-03-02T00:00:00Z", 1000)],
			{ from: null, to: new Date("2025-02-28T23:59:59Z") },
		);
		expect(stats.totalTrades).toBe(0);
		expect(stats.totalBalance).toBe(0);
	});
});

describe("computeAvgHoldTime", () => {
	it("returns null for an empty sample", () => {
		expect(computeAvgHoldTime([])).toBeNull();
	});
	it("returns average hours", () => {
		const trades = [
			t("2025-01-01T10:00:00Z", "2025-01-01T08:00:00Z", 100), // 2h
			t("2025-01-02T12:00:00Z", "2025-01-02T08:00:00Z", 50), // 4h
		];
		expect(computeAvgHoldTime(trades)).toBe(3);
	});
});

describe("computeAccountReturn", () => {
	const closed = (
		entryISO: string,
		exitISO: string | null,
		netPnl: number,
	): TradeRecord => ({
		status: "CLOSED",
		entryDate: new Date(entryISO),
		exitDate: exitISO ? new Date(exitISO) : null,
		netPnl,
	});
	const deposit = {
		occurredAt: new Date("2025-01-01T00:00:00Z"),
		amount: 10000,
	};
	const trade = closed("2025-01-10T09:00:00Z", "2025-01-10T15:00:00Z", 210);

	it("divides net P&L by the balance just before entry", () => {
		const earlier = closed("2025-01-02T09:00:00Z", "2025-01-03T09:00:00Z", 500);
		expect(computeAccountReturn(trade, [earlier, trade], [deposit])).toEqual({
			percent: 2,
			balanceAtEntry: 10500,
		});
	});

	it("counts adjustments before entry and ignores later flows and exits", () => {
		const overlapping = closed(
			"2025-01-09T09:00:00Z",
			"2025-01-10T12:00:00Z",
			-400,
		);
		const result = computeAccountReturn(
			trade,
			[overlapping, trade],
			[
				deposit,
				{
					occurredAt: new Date("2025-01-05T00:00:00Z"),
					amount: 500,
					kind: "ADJUSTMENT",
				},
				{ occurredAt: new Date("2025-01-11T00:00:00Z"), amount: 5000 },
			],
		);
		expect(result.balanceAtEntry).toBe(10500);
	});

	it("is unavailable, not zero, without a positive balance at entry", () => {
		expect(computeAccountReturn(trade, [trade], [])).toEqual({
			percent: null,
			balanceAtEntry: 0,
		});
	});

	it("is unavailable for a trade that is not closed", () => {
		const open = { ...trade, status: "OPEN", exitDate: null };
		expect(computeAccountReturn(open, [open], [deposit]).percent).toBeNull();
	});
});
