import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, sum } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { loadAccountHistory } from "@/db/account-history";
import { trades } from "@/db/schema";
import { tradeConditions, tradeOrder } from "@/db/trade-filter";
import { loadTagsByTrade, withTags } from "@/db/trade-tags";
import { computeAccountReturn } from "@/lib/risk-metrics";
import { TradeStatus } from "@/lib/trade";
import { sortedTradeFilterSchema } from "@/lib/trade-sort";
import { BULK_EDIT_LIMIT } from "@/lib/trade-tag";
import { authMiddleware } from "./auth-middleware";

const PAGE_SIZE = 50;

const filterSchema = sortedTradeFilterSchema.extend({
	page: z.number().default(1),
});

export const getTrades = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(filterSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const where = tradeConditions(userId, data);

		const [rows, [{ total }], [closed]] = await Promise.all([
			db
				.select()
				.from(trades)
				.where(where)
				.orderBy(...tradeOrder(data))
				.limit(PAGE_SIZE)
				.offset((data.page - 1) * PAGE_SIZE),
			db.select({ total: count() }).from(trades).where(where),
			db
				.select({ count: count(), netPnl: sum(trades.netPnl) })
				.from(trades)
				.where(and(where, eq(trades.status, TradeStatus.Closed))),
		]);

		return {
			trades: await withTags(userId, rows),
			total: Number(total),
			closedSummary: {
				count: Number(closed.count),
				netPnl: Number(closed.netPnl ?? 0),
			},
			page: data.page,
			pageSize: PAGE_SIZE,
		};
	});

/** Every trade id that matches the filter, for "select all matching"; capped one above the bulk limit so the client can tell when it is exceeded. */
export const getTradeIds = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(sortedTradeFilterSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const rows = await db
			.select({ id: trades.id })
			.from(trades)
			.where(tradeConditions(userId, data))
			.orderBy(...tradeOrder(data))
			.limit(BULK_EDIT_LIMIT + 1);
		return rows.map((row) => row.id);
	});

export const getTradeById = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			id: z.coerce.number().int().positive(),
		}),
	)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const [history, [trade]] = await Promise.all([
			loadAccountHistory(userId, data.portfolioId),
			db
				.select()
				.from(trades)
				.where(
					and(
						eq(trades.id, data.id),
						eq(trades.portfolioId, data.portfolioId),
						eq(trades.userId, userId),
					),
				),
		]);
		if (!trade) return null;
		const tagsByTrade = await loadTagsByTrade(userId, [trade.id]);

		return {
			...trade,
			tags: tagsByTrade.get(trade.id) ?? [],
			accountReturn: computeAccountReturn(
				{ ...trade, netPnl: Number(trade.netPnl ?? 0) },
				history.trades,
				history.cashFlows,
			),
		};
	});
