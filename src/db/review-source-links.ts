import { and, eq, exists, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	reviewPeriods,
	reviewSourceCashFlows,
	reviewSourceTrades,
} from "./schema";

export function hasTradeReviewReference(
	userId: string,
	portfolioId: number,
	tradeId: number,
) {
	return exists(
		db
			.select({ id: sql`1` })
			.from(reviewSourceTrades)
			.innerJoin(
				reviewPeriods,
				eq(reviewPeriods.id, reviewSourceTrades.reviewId),
			)
			.where(
				and(
					eq(reviewPeriods.userId, userId),
					eq(reviewPeriods.portfolioId, portfolioId),
					eq(reviewSourceTrades.tradeId, tradeId),
				),
			),
	);
}
export function hasCashFlowReviewReference(
	userId: string,
	portfolioId: number,
	cashFlowId: number,
) {
	return exists(
		db
			.select({ id: sql`1` })
			.from(reviewSourceCashFlows)
			.innerJoin(
				reviewPeriods,
				eq(reviewPeriods.id, reviewSourceCashFlows.reviewId),
			)
			.where(
				and(
					eq(reviewPeriods.userId, userId),
					eq(reviewPeriods.portfolioId, portfolioId),
					eq(reviewSourceCashFlows.cashFlowId, cashFlowId),
				),
			),
	);
}
