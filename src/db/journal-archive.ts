import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
	cashFlows,
	portfolios,
	reviewPeriods,
	reviewSourceCashFlows,
	reviewSourceTrades,
	savedViews,
	strategies,
	tags,
	trades,
	tradeTags,
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
		tagRows,
		tradeTagRows,
		savedViewRows,
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
		db.select().from(tags).where(eq(tags.userId, userId)),
		db
			.select({ link: tradeTags })
			.from(tradeTags)
			.innerJoin(tags, eq(tradeTags.tagId, tags.id))
			.where(eq(tags.userId, userId)),
		db.select().from(savedViews).where(eq(savedViews.userId, userId)),
	]);
	return {
		accounts: accountRows.map(withoutUserId),
		trades: tradeRows.map(({ clientDraftId: _, ...trade }) =>
			withoutUserId(trade),
		),
		cashFlows: cashFlowRows.map(withoutUserId),
		strategies: strategyRows.map(withoutUserId),
		reviews: reviewRows.map(withoutUserId),
		reviewSourceTrades: sourceTradeRows.map((row) => row.link),
		reviewSourceCashFlows: sourceCashFlowRows.map((row) => row.link),
		tags: tagRows.map(withoutUserId),
		tradeTags: tradeTagRows.map((row) => row.link),
		savedViews: savedViewRows.map(withoutUserId),
	};
}
