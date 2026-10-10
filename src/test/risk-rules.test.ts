import { describe, expect, it } from "vitest";
import {
	DailyLossUnit,
	hasRiskRules,
	riskRulesInputSchema,
	storedRiskRulesSchema,
} from "@/lib/risk-rules";

describe("riskRulesInputSchema", () => {
	it("accepts each rule alone, with decimal strings", () => {
		const inputs = [
			{ maxTradeRiskAmount: "250.50" },
			{ maxTradeRiskPercent: "0.5" },
			{ dailyLoss: { unit: DailyLossUnit.Amount, value: "500" } },
			{ dailyLoss: { unit: DailyLossUnit.BalancePercent, value: "2" } },
			{ maxTradesPerDay: 3 },
			{ cooldown: { afterLosses: 2, minutes: 30 } },
		];
		for (const input of inputs)
			expect(
				riskRulesInputSchema.safeParse(input).success,
				JSON.stringify(input),
			).toBe(true);
	});

	it("needs one or more rules", () => {
		const result = riskRulesInputSchema.safeParse({});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].message).toBe(
			"Set one or more limits, or clear the rules.",
		);
	});

	it("rejects values out of range", () => {
		const inputs = [
			{ maxTradeRiskAmount: "0" },
			{ maxTradeRiskAmount: "1e3" },
			{ maxTradeRiskAmount: 100 },
			{ maxTradeRiskPercent: "100.1" },
			{ dailyLoss: { unit: DailyLossUnit.BalancePercent, value: "101" } },
			{ dailyLoss: { unit: "equity", value: "5" } },
			{ maxTradesPerDay: 0 },
			{ maxTradesPerDay: 101 },
			{ maxTradesPerDay: 2.5 },
			{ cooldown: { afterLosses: 0, minutes: 30 } },
			{ cooldown: { afterLosses: 11, minutes: 30 } },
			{ cooldown: { afterLosses: 1, minutes: 1441 } },
		];
		for (const input of inputs)
			expect(
				riskRulesInputSchema.safeParse(input).success,
				JSON.stringify(input),
			).toBe(false);
	});

	it("allows a large amount for a daily loss in amount units", () => {
		expect(
			riskRulesInputSchema.safeParse({
				dailyLoss: { unit: DailyLossUnit.Amount, value: "150000" },
			}).success,
		).toBe(true);
	});

	it("stores each decimal in one canonical form", () => {
		const rules = riskRulesInputSchema.parse({
			maxTradeRiskAmount: "0500.00",
			maxTradeRiskPercent: ".50",
			dailyLoss: { unit: DailyLossUnit.Amount, value: "250.10" },
		});
		expect(rules).toEqual({
			maxTradeRiskAmount: "500",
			maxTradeRiskPercent: "0.5",
			dailyLoss: { unit: DailyLossUnit.Amount, value: "250.1" },
		});
	});
});

describe("storedRiskRulesSchema", () => {
	it("accepts an empty set, which is a cleared version", () => {
		const rules = storedRiskRulesSchema.parse({ v: 1 });
		expect(hasRiskRules(rules)).toBe(false);
	});

	it("rejects an unknown shape version", () => {
		expect(storedRiskRulesSchema.safeParse({ v: 2 }).success).toBe(false);
	});

	it("reports a set rule", () => {
		expect(hasRiskRules({ v: 1, maxTradesPerDay: 3 })).toBe(true);
	});
});
