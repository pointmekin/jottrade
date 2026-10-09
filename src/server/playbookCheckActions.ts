import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadPlaybookCheck, writePlaybookCheck } from "@/db/playbook-checks";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { CriterionResult } from "@/lib/playbook-check";
import { authMiddleware } from "./auth-middleware";

const scope = z.object({
	portfolioId: z.number().int().positive(),
	id: z.number().int().positive(),
});

export const getPlaybookCheck = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(scope)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		await requireOwnedPortfolio(userId, data.portfolioId);
		return loadPlaybookCheck(userId, data.portfolioId, data.id);
	});

/** The client sends only the answers; the server copies the stored criteria into the snapshot. */
export const savePlaybookCheck = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		scope.extend({
			expectedRevision: z.number().int().nonnegative(),
			criteriaVersion: z.number().int().positive(),
			results: z.record(z.string().max(40), z.enum(CriterionResult)),
		}),
	)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		await requireOwnedPortfolio(userId, data.portfolioId);
		return writePlaybookCheck(userId, data);
	});
