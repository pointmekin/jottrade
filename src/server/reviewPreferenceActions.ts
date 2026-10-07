import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { reviewPreferencesSchema } from "@/lib/review-period";
import { authMiddleware } from "./auth-middleware";

export const getReviewPreferences = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ portfolioId: z.number().int().positive() }))
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const [row] = await db
			.select({
				timezone: portfolios.reviewTimezone,
				weekStartsOn: portfolios.reviewWeekStartsOn,
			})
			.from(portfolios)
			.where(
				and(eq(portfolios.id, data.portfolioId), eq(portfolios.userId, userId)),
			);
		if (!row) throw new Error("Account not found.");
		return row;
	});
export const updateReviewPreferences = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(reviewPreferencesSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const [row] = await db
			.update(portfolios)
			.set({
				reviewTimezone: data.timezone,
				reviewWeekStartsOn: data.weekStartsOn,
			})
			.where(
				and(eq(portfolios.id, data.portfolioId), eq(portfolios.userId, userId)),
			)
			.returning({
				timezone: portfolios.reviewTimezone,
				weekStartsOn: portfolios.reviewWeekStartsOn,
			});
		if (!row) throw new Error("Account not found.");
		return row;
	});
