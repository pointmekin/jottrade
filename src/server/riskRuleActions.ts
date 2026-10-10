import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadComplianceHistory } from "@/db/risk-rule-compliance";
import { loadRuleContext } from "@/db/risk-rule-context";
import { appendRiskRuleVersion, loadRiskRules } from "@/db/risk-rules";
import {
	analysisScopeSchema,
	isTradeAttributeFiltered,
	toDateRange,
} from "@/lib/analysis-scope";
import { evaluateCompliance, evaluateToday } from "@/lib/risk-rule-compliance";
import { riskRulesInputSchema } from "@/lib/risk-rules";
import { authMiddleware } from "./auth-middleware";

const portfolioIdSchema = z.object({
	portfolioId: z.number().int().positive(),
});

export const getRiskRules = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(portfolioIdSchema)
	.handler(({ data, context }) =>
		loadRiskRules(context.userId, data.portfolioId),
	);

export type RiskRulesState = Awaited<ReturnType<typeof loadRiskRules>>;

export const getRuleContext = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(portfolioIdSchema.extend({ entryDate: z.iso.datetime() }))
	.handler(({ data, context }) =>
		loadRuleContext(context.userId, data.portfolioId, new Date(data.entryDate)),
	);

export const getRuleToday = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(portfolioIdSchema)
	.handler(async ({ data, context }) => {
		const history = await loadComplianceHistory(
			context.userId,
			data.portfolioId,
		);
		return history && evaluateToday(history, new Date());
	});

/** Rules read only the account and the period of the scope. */
export const getRuleCompliance = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(analysisScopeSchema)
	.handler(async ({ data, context }) => {
		const history = await loadComplianceHistory(
			context.userId,
			data.portfolioId,
		);
		if (!history) return null;
		return {
			...evaluateCompliance(history, toDateRange(data)),
			scopeIgnored: isTradeAttributeFiltered(data),
		};
	});

export type RuleComplianceResult = NonNullable<
	Awaited<ReturnType<typeof getRuleCompliance>>
>;

export const saveRiskRules = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(portfolioIdSchema.extend({ rules: riskRulesInputSchema }))
	.handler(({ data, context }) =>
		appendRiskRuleVersion(context.userId, data.portfolioId, {
			v: 1,
			...data.rules,
		}),
	);

export const clearRiskRules = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(portfolioIdSchema)
	.handler(({ data, context }) =>
		appendRiskRuleVersion(context.userId, data.portfolioId, { v: 1 }),
	);
