import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOwnedPortfolio } from "@/db/portfolios";
import {
	loadTradeAnnotation,
	writeTradeAnnotation,
} from "@/db/review-annotations";
import { requireUserId } from "@/lib/auth";

const scope = z.object({
	portfolioId: z.number().int().positive(),
	id: z.number().int().positive(),
});
export const getTradeReviewAnnotation = createServerFn({ method: "GET" })
	.validator(scope)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedPortfolio(userId, data.portfolioId);
		const annotation = await loadTradeAnnotation(
			userId,
			data.portfolioId,
			data.id,
		);
		return {
			revision: annotation.trade.annotationRevision,
			fields: { notes: annotation.trade.notes ?? "" },
			reviewed: annotation.reviewed,
			fingerprint: annotation.executionFingerprint,
		};
	});
export const saveTradeReviewAnnotation = createServerFn({ method: "POST" })
	.validator(
		scope.extend({
			expectedRevision: z.number().int().nonnegative(),
			notes: z.string().max(20000),
			review: z.enum(["KEEP", "COMPLETE", "REOPEN"]).default("KEEP"),
			expectedFingerprint: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedPortfolio(userId, data.portfolioId);
		return writeTradeAnnotation(userId, data);
	});
