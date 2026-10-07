import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { DEFAULT_CURRENCY } from "@/lib/currency";

export async function requireOwnedPortfolio(
	userId: string,
	portfolioId: number,
) {
	const [portfolio] = await db
		.select({
			id: portfolios.id,
			name: portfolios.name,
			currency: portfolios.currency,
		})
		.from(portfolios)
		.where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)));
	if (!portfolio) throw new Error("Account not found.");
	return portfolio;
}

/**
 * Gives the user exactly one default account. Sign-up calls it (Better Auth
 * hook in src/lib/auth.ts), and `ensureDefaultAccount` calls it for users who
 * signed up before that hook. It is idempotent and safe under concurrent calls:
 * the partial unique index on (user_id) WHERE is_default turns a second insert
 * into a no-op, and a repair marks the same oldest account in every caller.
 */
export async function ensureDefaultPortfolio(userId: string) {
	const [first] = await db
		.select({ id: portfolios.id, isDefault: portfolios.isDefault })
		.from(portfolios)
		.where(eq(portfolios.userId, userId))
		.orderBy(desc(portfolios.isDefault), asc(portfolios.id))
		.limit(1);
	if (first?.isDefault) return;
	if (!first) {
		await db
			.insert(portfolios)
			.values({
				userId,
				name: "Main account",
				currency: DEFAULT_CURRENCY,
				isDefault: true,
			})
			.onConflictDoNothing();
		return;
	}
	await db
		.update(portfolios)
		.set({ isDefault: true })
		.where(
			and(
				eq(portfolios.id, first.id),
				sql`NOT EXISTS (SELECT 1 FROM ${portfolios} WHERE ${portfolios.userId} = ${userId} AND ${portfolios.isDefault})`,
			),
		);
}
