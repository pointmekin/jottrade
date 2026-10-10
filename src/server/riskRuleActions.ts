import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { appendRiskRuleVersion, loadRiskRules } from "@/db/risk-rules";
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
