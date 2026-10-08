import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { reopenReview, saveReview } from "@/db/review-writes";
import { readReview } from "@/db/reviews";
import { reviewFieldsSchema } from "@/lib/review";
import { reviewScopeSchema } from "@/lib/review-period";
import { authMiddleware } from "./auth-middleware";

export const getReviewPeriod = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(reviewScopeSchema)
	.handler(async ({ data, context }) => readReview(context.userId, data));
export const saveReviewPeriod = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		reviewScopeSchema.extend({
			expectedRevision: z.number().int().nonnegative(),
			fields: reviewFieldsSchema,
			complete: z.boolean().default(false),
		}),
	)
	.handler(async ({ data, context }) => saveReview(context.userId, data));
export const reopenReviewPeriod = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			id: z.number().int().positive(),
			expectedRevision: z.number().int().nonnegative(),
		}),
	)
	.handler(async ({ data, context }) =>
		reopenReview(
			context.userId,
			data.portfolioId,
			data.id,
			data.expectedRevision,
		),
	);
