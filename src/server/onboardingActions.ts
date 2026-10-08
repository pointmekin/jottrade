import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ensureDefaultPortfolio } from "@/db/portfolios";
import {
	cashFlows,
	portfolios,
	reviewPeriods,
	trades,
	userOnboarding,
} from "@/db/schema";
import { AccountEntryKind } from "@/lib/account-entry";
import { firstAccountSchema, type OnboardingFacts } from "@/lib/onboarding";
import { ReviewKind, ReviewStatus } from "@/lib/review";
import { authMiddleware } from "./auth-middleware";

export type OnboardingState = {
	facts: OnboardingFacts;
	isDismissed: boolean;
};

export const getOnboarding = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<OnboardingState> => {
		const { userId } = context;

		const [configured, deposit, trade, review, dismissal] = await Promise.all([
			db
				.select({ id: portfolios.id })
				.from(portfolios)
				.where(
					and(
						eq(portfolios.userId, userId),
						isNotNull(portfolios.reviewTimezone),
					),
				)
				.limit(1),
			db
				.select({ id: cashFlows.id })
				.from(cashFlows)
				.where(
					and(
						eq(cashFlows.userId, userId),
						eq(cashFlows.kind, AccountEntryKind.Deposit),
					),
				)
				.limit(1),
			db
				.select({ id: trades.id })
				.from(trades)
				.where(eq(trades.userId, userId))
				.limit(1),
			db
				.select({ id: reviewPeriods.id })
				.from(reviewPeriods)
				.where(
					and(
						eq(reviewPeriods.userId, userId),
						eq(reviewPeriods.kind, ReviewKind.Daily),
						eq(reviewPeriods.status, ReviewStatus.Complete),
					),
				)
				.limit(1),
			db
				.select({ dismissedAt: userOnboarding.dismissedAt })
				.from(userOnboarding)
				.where(eq(userOnboarding.userId, userId)),
		]);

		const hasTrades = trade.length > 0;
		return {
			facts: {
				// A trade proves the account works, even for users who never opened setup.
				isAccountConfigured: configured.length > 0 || hasTrades,
				hasFunding: deposit.length > 0,
				hasTrades,
				hasCompletedReview: review.length > 0,
			},
			isDismissed: dismissal[0]?.dismissedAt != null,
		};
	});

export const setOnboardingDismissed = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ isDismissed: z.boolean() }))
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const dismissedAt = data.isDismissed ? new Date() : null;

		await db
			.insert(userOnboarding)
			.values({ userId, dismissedAt })
			.onConflictDoUpdate({
				target: userOnboarding.userId,
				set: { dismissedAt },
			});

		return { isDismissed: data.isDismissed };
	});

async function findPrimaryPortfolio(userId: string) {
	const [primary] = await db
		.select({ id: portfolios.id })
		.from(portfolios)
		.where(eq(portfolios.userId, userId))
		.orderBy(desc(portfolios.isDefault), asc(portfolios.id))
		.limit(1);
	return primary;
}

/**
 * Creates the user's first account, or finishes the setup of the account a
 * legacy first read already created. It never depends on `getAccounts`.
 */
export const setupFirstAccount = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		firstAccountSchema.extend({
			accountId: z.number().int().positive().optional(),
		}),
	)
	.handler(async ({ data, context }) => {
		const { userId } = context;

		let primary = data.accountId
			? { id: data.accountId }
			: await findPrimaryPortfolio(userId);
		if (!primary) {
			await ensureDefaultPortfolio(userId);
			primary = await findPrimaryPortfolio(userId);
		}
		if (!primary) throw new Error("The account could not be created.");

		const [account] = await db
			.update(portfolios)
			.set({
				name: data.name,
				description: data.broker || null,
				currency: data.currency,
				reviewTimezone: data.timezone,
			})
			.where(and(eq(portfolios.id, primary.id), eq(portfolios.userId, userId)))
			.returning({ id: portfolios.id });

		if (!account) throw new Error("Account not found.");
		return { accountId: account.id };
	});
