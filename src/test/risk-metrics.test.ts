import { describe, expect, it } from "vitest";
import { AccountEntryKind } from "@/lib/account-entry";
import type { EquityPoint } from "@/lib/analytics";
import {
	computeAccountReturn,
	computeAvgHoldTime,
	computeMaxDrawdown,
	computePayoffRatio,
	computeSharpe,
	MIN_SHARPE_DAYS,
} from "@/lib/risk-metrics";
import { TradeStatus } from "@/lib/trade";
import { closedTrade } from "./trade-fixtures";

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
				closedTrade("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", 100),
			]).ratio,
		).toBeNull();
	});

	it("is unavailable, not zero, with no wins", () => {
		expect(
			computePayoffRatio([
				closedTrade("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", -100),
			]).ratio,
		).toBeNull();
	});

	it("divides the average win by the absolute average loss and ignores breakeven", () => {
		expect(
			computePayoffRatio([
				closedTrade("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", 200),
				closedTrade("2025-01-02T00:00:00Z", "2025-01-02T00:00:00Z", 100),
				closedTrade("2025-01-03T00:00:00Z", "2025-01-03T00:00:00Z", -100),
				closedTrade("2025-01-04T00:00:00Z", "2025-01-04T00:00:00Z", 0),
			]),
		).toEqual({ ratio: 1.5, avgWin: 150, avgLoss: 100, wins: 2, losses: 1 });
	});
});

describe("computeAvgHoldTime", () => {
	it("returns null for an empty sample", () => {
		expect(computeAvgHoldTime([])).toBeNull();
	});
	it("returns average hours", () => {
		const trades = [
			closedTrade("2025-01-01T08:00:00Z", "2025-01-01T10:00:00Z", 100), // 2h
			closedTrade("2025-01-02T08:00:00Z", "2025-01-02T12:00:00Z", 50), // 4h
		];
		expect(computeAvgHoldTime(trades)).toBe(3);
	});
});

describe("computeAccountReturn", () => {
	const deposit = {
		occurredAt: new Date("2025-01-01T00:00:00Z"),
		amount: 10000,
	};
	const trade = closedTrade(
		"2025-01-10T09:00:00Z",
		"2025-01-10T15:00:00Z",
		210,
	);

	it("divides net P&L by the balance just before entry", () => {
		const earlier = closedTrade(
			"2025-01-02T09:00:00Z",
			"2025-01-03T09:00:00Z",
			500,
		);
		expect(computeAccountReturn(trade, [earlier, trade], [deposit])).toEqual({
			percent: 2,
			balanceAtEntry: 10500,
		});
	});

	it("counts adjustments before entry and ignores later flows and exits", () => {
		const overlapping = closedTrade(
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
					kind: AccountEntryKind.Adjustment,
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
		const open = { ...trade, status: TradeStatus.Open, exitDate: null };
		expect(computeAccountReturn(open, [open], [deposit]).percent).toBeNull();
	});
});
