import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cashFlows, trades } from "@/db/schema";
import { tradeConditions } from "@/db/trade-filter";
import {
	isTradeAttributeFiltered,
	type TradeFilter,
} from "@/lib/analysis-scope";

const toTradeRecord = (trade: typeof trades.$inferSelect) => ({
	...trade,
	netPnl: Number(trade.netPnl ?? 0),
});

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
		trades: tradeRows.map(toTradeRecord),
		cashFlows: flowRows.map((flow) => ({
			...flow,
			amount: Number(flow.amount),
		})),
	};
}

/**
 * The trades that match the trade attributes, or `undefined` without a trade
 * attribute filter. The caller applies the period, so open positions carried
 * into it still count.
 */
export async function loadMatchingTrades(userId: string, filter: TradeFilter) {
	if (!isTradeAttributeFiltered(filter)) return undefined;
	const rows = await db
		.select()
		.from(trades)
		.where(
			tradeConditions(userId, {
				...filter,
				dateFrom: undefined,
				dateTo: undefined,
			}),
		);
	return rows.map(toTradeRecord);
}
