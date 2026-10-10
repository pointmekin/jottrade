import { z } from "zod";
import { positiveDecimal } from "./trade-risk-schema";

export const DailyLossUnit = {
	Amount: "amount",
	BalancePercent: "balance_percent",
} as const;
export type DailyLossUnit = (typeof DailyLossUnit)[keyof typeof DailyLossUnit];

export const RULES_DISCLAIMER =
	"Journal checks are reminders. They cannot stop orders at your broker or guarantee prop-firm compliance.";

// One form per value, so "500" and "500.00" compare equal as stored jsonb.
function canonicalDecimal(value: string) {
	const [whole, fraction = ""] = value.split(".");
	const integer = BigInt(whole || "0").toString();
	let end = fraction.length;
	while (end > 0 && fraction[end - 1] === "0") end -= 1;
	return end ? `${integer}.${fraction.slice(0, end)}` : integer;
}

const amount = positiveDecimal.transform(canonicalDecimal);
const percent = positiveDecimal
	.refine((value) => Number(value) <= 100, "Enter 100 or less.")
	.transform(canonicalDecimal);

const riskRulesShape = {
	maxTradeRiskAmount: amount.optional(),
	maxTradeRiskPercent: percent.optional(),
	dailyLoss: z
		.discriminatedUnion("unit", [
			z.object({
				unit: z.literal(DailyLossUnit.Amount),
				value: amount,
			}),
			z.object({
				unit: z.literal(DailyLossUnit.BalancePercent),
				value: percent,
			}),
		])
		.optional(),
	maxTradesPerDay: z.number().int().min(1).max(100).optional(),
	cooldown: z
		.object({
			afterLosses: z.number().int().min(1).max(10),
			minutes: z.number().int().min(1).max(1440),
		})
		.optional(),
};

export const storedRiskRulesSchema = z.object({
	v: z.literal(1),
	...riskRulesShape,
});
export type RiskRules = z.infer<typeof storedRiskRulesSchema>;

export const hasRiskRules = (rules: Partial<RiskRules>) =>
	Object.keys(riskRulesShape).some(
		(key) => rules[key as keyof typeof riskRulesShape] !== undefined,
	);

export const riskRulesInputSchema = z
	.object(riskRulesShape)
	.refine(hasRiskRules, "Set one or more limits, or clear the rules.");
export type RiskRulesInput = z.infer<typeof riskRulesInputSchema>;
