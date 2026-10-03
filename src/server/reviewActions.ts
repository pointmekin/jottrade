import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { reopenReview, saveReview } from "@/db/review-writes";
import { readReview } from "@/db/reviews";
import { requireUserId } from "@/lib/auth";
import { reviewFieldsSchema } from "@/lib/review";
import { reviewScopeSchema } from "@/lib/review-period";

export const getReviewPeriod = createServerFn({ method: "GET" })
	.validator(reviewScopeSchema)
	.handler(async ({ data }) => readReview(await requireUserId(), data));
export const saveReviewPeriod = createServerFn({ method: "POST" })
	.validator(
		reviewScopeSchema.extend({
			expectedRevision: z.number().int().nonnegative(),
			fields: reviewFieldsSchema,
			complete: z.boolean().default(false),
		}),
	)
	.handler(async ({ data }) => saveReview(await requireUserId(), data));
export const reopenReviewPeriod = createServerFn({ method: "POST" })
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			id: z.number().int().positive(),
			expectedRevision: z.number().int().nonnegative(),
		}),
	)
	.handler(async ({ data }) =>
		reopenReview(
			await requireUserId(),
			data.portfolioId,
			data.id,
			data.expectedRevision,
		),
	);
