import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
	cashFlows,
	portfolios,
	reviewPeriods,
	reviewSourceCashFlows,
	reviewSourceTrades,
	strategies,
	trades,
} from "@/db/schema";

function withoutUserId<Row extends { userId: string }>(
	row: Row,
): Omit<Row, "userId"> {
	const copy: Partial<Row> = { ...row };
	delete copy.userId;
	return copy as Omit<Row, "userId">;
}

/** Reads only rows the user owns; credentials and sessions live in other tables and are never read. */
export async function loadArchiveTables(userId: string) {
	const [
		accountRows,
		tradeRows,
		cashFlowRows,
		strategyRows,
		reviewRows,
		sourceTradeRows,
		sourceCashFlowRows,
	] = await Promise.all([
		db.select().from(portfolios).where(eq(portfolios.userId, userId)),
		db.select().from(trades).where(eq(trades.userId, userId)),
		db.select().from(cashFlows).where(eq(cashFlows.userId, userId)),
		db.select().from(strategies).where(eq(strategies.userId, userId)),
		db.select().from(reviewPeriods).where(eq(reviewPeriods.userId, userId)),
		db
			.select({ link: reviewSourceTrades })
			.from(reviewSourceTrades)
			.innerJoin(
				reviewPeriods,
				eq(reviewSourceTrades.reviewId, reviewPeriods.id),
			)
			.where(eq(reviewPeriods.userId, userId)),
		db
			.select({ link: reviewSourceCashFlows })
			.from(reviewSourceCashFlows)
			.innerJoin(
				reviewPeriods,
				eq(reviewSourceCashFlows.reviewId, reviewPeriods.id),
			)
			.where(eq(reviewPeriods.userId, userId)),
	]);
	return {
		accounts: accountRows.map(withoutUserId),
		trades: tradeRows.map(withoutUserId),
		cashFlows: cashFlowRows.map(withoutUserId),
		strategies: strategyRows.map(withoutUserId),
		reviews: reviewRows.map(withoutUserId),
		reviewSourceTrades: sourceTradeRows.map((row) => row.link),
		reviewSourceCashFlows: sourceCashFlowRows.map((row) => row.link),
	};
}
