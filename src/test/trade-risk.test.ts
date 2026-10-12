import { describe, expect, it } from "vitest";
import { calculateManualPnl } from "@/lib/pnl-context";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { tradeCaptureSchema } from "@/lib/trade-capture";
import {
	calculateInitialRisk,
	calculatePlannedRewardRisk,
	calculatePositionSize,
	calculateRealizedR,
} from "@/lib/trade-risk";
import {
	initialRiskSnapshotSchema,
	RiskUnavailableReason,
} from "@/lib/trade-risk-schema";

const entry = {
	symbol: "EURUSD",
	side: TradeSide.Long,
	entryPrice: "1.1",
	initialStopPrice: "1.095",
	targetPrice: "1.11",
	quantity: "0.2",
	accountCurrency: "USD",
	entryDate: "2026-10-01T10:00:00Z",
	balanceAccount: "10000",
};
function outcome(
	plan: ReturnType<typeof calculateInitialRisk>,
	netPnl = "195",
) {
	return calculateRealizedR({ ...plan, status: TradeStatus.Closed, netPnl });
}
describe("original risk and sizing", () => {
	it.each([
		[entry, "100", 1.95],
		[
			{
				...entry,
				side: TradeSide.Short,
				initialStopPrice: "1.105",
				targetPrice: "1.09",
			},
			"100",
			1.95,
		],
		[
			{
				...entry,
				symbol: "XAUUSDm",
				side: TradeSide.Short,
				entryPrice: "2000",
				initialStopPrice: "2010",
				targetPrice: "1980",
				quantity: "0.1",
			},
			"100",
			1.95,
		],
		[
			{
				...entry,
				symbol: "AAPL",
				entryPrice: "150",
				initialStopPrice: "145",
				targetPrice: "160",
				quantity: "20",
				confirmedUnitQuoteCurrency: "USD",
			},
			"100",
			1.95,
		],
		[
			{
				...entry,
				symbol: "USDJPY",
				entryPrice: "150",
				initialStopPrice: "149",
				targetPrice: "152",
				quantity: "0.15",
			},
			"100",
			1.95,
		],
	])("calculates known lot/metal/unit risk %#", (input, amount, expectedR) => {
		const plan = calculateInitialRisk(input);
		expect(Number(plan.initialRiskAmount)).toBeCloseTo(Number(amount), 8);
		expect(Number(plan.initialRiskPercent)).toBeCloseTo(1, 8);
		expect(calculatePlannedRewardRisk(plan.initialRiskSnapshot)).toBeCloseTo(
			2,
			8,
		);
		expect(outcome(plan)).toBeCloseTo(expectedR, 8);
		expect(initialRiskSnapshotSchema.parse(plan.initialRiskSnapshot)).toEqual(
			plan.initialRiskSnapshot,
		);
	});
	it("sizes lots rather than returning underlying units", () => {
		expect(Number(calculatePositionSize(entry, 100))).toBeCloseTo(0.2, 10);
		expect(
			Number(
				calculatePositionSize(
					{
						...entry,
						symbol: "XAUUSD",
						entryPrice: "2000",
						initialStopPrice: "1990",
					},
					100,
				),
			),
		).toBeCloseTo(0.1, 10);
	});
	it("separates missing stop, specification, FX and balance", () => {
		const noStop = calculateInitialRisk({ ...entry, initialStopPrice: "" });
		expect(noStop.initialRiskAmount).toBeNull();
		expect(noStop.initialRiskSnapshot?.unavailableReason).toBe(
			RiskUnavailableReason.MissingStop,
		);
		const unknown = calculateInitialRisk({ ...entry, symbol: "ABCDEF" });
		expect(unknown.initialRiskSnapshot?.unavailableReason).toBe(
			RiskUnavailableReason.UnknownSpec,
		);
		const missingFx = calculateInitialRisk({ ...entry, symbol: "EURJPY" });
		expect(missingFx.initialRiskSnapshot?.unavailableReason).toBe(
			RiskUnavailableReason.MissingFx,
		);
		const noBalance = calculateInitialRisk({ ...entry, balanceAccount: "" });
		expect(noBalance.initialRiskPercent).toBeNull();
		expect(outcome(noBalance)).toBeCloseTo(1.95);
	});
	it.each([
		[TradeSide.Long, "1.1"],
		[TradeSide.Long, "1.2"],
		[TradeSide.Short, "1.1"],
		[TradeSide.Short, "1.0"],
	])("rejects equal or wrong-side stops %s %s", (side, initialStopPrice) => {
		expect(() =>
			calculateInitialRisk({ ...entry, side, initialStopPrice }),
		).toThrow("Initial stop");
	});
	it("keeps original RR independent of wrong-side targets and R distinct from missing values", () => {
		const plan = calculateInitialRisk(entry);
		expect(
			calculatePlannedRewardRisk({
				...(plan.initialRiskSnapshot as NonNullable<
					typeof plan.initialRiskSnapshot
				>),
				targetPrice: "1.09",
			}),
		).toBeNull();
		expect(outcome(plan, "0")).toBe(0);
		expect(outcome(plan, "-105")).toBeCloseTo(-1.05);
		expect(
			calculateRealizedR({ ...plan, status: TradeStatus.Open, netPnl: "195" }),
		).toBeNull();
		expect(
			calculateRealizedR({ ...plan, status: TradeStatus.Closed, netPnl: null }),
		).toBeNull();
		expect(
			calculateRealizedR(
				{ ...plan, status: TradeStatus.Closed, netPnl: "195" },
				"THB",
			),
		).toBeNull();
	});
	it.each(["NaN", "Infinity", "-1", "0", "1e309"])(
		"rejects invalid capture price/rate %s",
		(value) => {
			expect(
				tradeCaptureSchema.safeParse({ ...entry, entryPrice: value }).success,
			).toBe(false);
			expect(
				tradeCaptureSchema.safeParse({
					...entry,
					entryQuoteToAccountRate: value,
				}).success,
			).toBe(false);
		},
	);
	it("does not persist a zero risk from subprecision or overflowing calculations", () => {
		expect(calculatePositionSize(entry, 1e-20)).toBeNull();
		expect(
			calculateInitialRisk({ ...entry, quantity: "0.0000000000000000001" })
				.initialRiskAmount,
		).toBeNull();
		expect(
			calculateInitialRisk({ ...entry, quantity: "1e309" }).initialRiskAmount,
		).toBeNull();
	});
});

describe("distinct entry risk and exit P&L conversion", () => {
	it("rejects an overflowing P&L before persistence", () => {
		expect(() =>
			calculateManualPnl({
				...entry,
				exitPrice: "1.11",
				quantity: `1${"0".repeat(308)}`,
			}),
		).toThrow("numerical range");
	});
	const cross = {
		...entry,
		symbol: "EURJPY",
		entryPrice: "169",
		initialStopPrice: "168",
		quantity: "0.15",
		entryQuoteToAccountRate: String(1 / 150),
	};
	it("uses the exit rate for net money and entry rate for original risk", () => {
		const risk = calculateInitialRisk(cross);
		const pnl = calculateManualPnl({
			...cross,
			exitPrice: "171",
			exitDate: "2026-10-01T12:00:00Z",
			exitQuoteToAccountRate: "0.00625",
			fees: "5",
		});
		expect(Number(risk.initialRiskAmount)).toBeCloseTo(100, 8);
		expect(pnl.netPnl).toBe("182.50");
		expect(pnl.returnPercent).toBe("1.18");
		expect(outcome(risk, pnl.netPnl)).toBeCloseTo(1.825, 8);
	});
	it("never reuses the entry rate or fabricates P&L when exit FX is missing", () => {
		expect(() => calculateManualPnl({ ...cross, exitPrice: "171" })).toThrow(
			"exit FX",
		);
		expect(() =>
			calculateManualPnl({
				...cross,
				exitPrice: "171",
				exitQuoteToAccountRate: "0.00625",
			}),
		).toThrow("exit date");
	});
	it("preserves unknown-unit legacy P&L and only converts explicitly confirmed units", () => {
		const unit = {
			...entry,
			symbol: "AAPL",
			entryPrice: "150",
			exitPrice: "160",
			quantity: "20",
			accountCurrency: "THB",
		};
		expect(calculateManualPnl(unit).netPnl).toBe("200.00");
		expect(() =>
			calculateManualPnl({ ...unit, exitQuoteToAccountRate: "35" }),
		).toThrow("Confirm units");
		expect(
			calculateManualPnl({
				...unit,
				confirmedUnitQuoteCurrency: "USD",
				exitQuoteToAccountRate: "35",
				exitDate: "2026-10-01T12:00:00Z",
			}).netPnl,
		).toBe("7000.00");
	});
});
