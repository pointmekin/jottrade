import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";

export async function requireOwnedPortfolio(
	userId: string,
	portfolioId: number,
) {
	const [portfolio] = await db
		.select({ id: portfolios.id, currency: portfolios.currency })
		.from(portfolios)
		.where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)));
	if (!portfolio) throw new Error("Account not found.");
	return portfolio;
}
