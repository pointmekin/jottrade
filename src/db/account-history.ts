import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cashFlows, trades } from "@/db/schema";

export async function loadAccountHistory(userId: string, portfolioId: number) {
	const [tradeRows, flowRows] = await Promise.all([
		db
			.select()
			.from(trades)
			.where(
				and(eq(trades.userId, userId), eq(trades.portfolioId, portfolioId)),
			),
		db
			.select({
				occurredAt: cashFlows.occurredAt,
				amount: cashFlows.amount,
				kind: cashFlows.kind,
			})
			.from(cashFlows)
			.where(
				and(
					eq(cashFlows.userId, userId),
					eq(cashFlows.portfolioId, portfolioId),
				),
			),
	]);
	return {
		trades: tradeRows.map((trade) => ({
			...trade,
			netPnl: Number(trade.netPnl ?? 0),
		})),
		cashFlows: flowRows.map((flow) => ({
			...flow,
			amount: Number(flow.amount),
		})),
	};
}
