import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { loadAccountHistory } from "@/db/account-history";
import { trades } from "@/db/schema";
import { tradeConditions, tradeFilterSchema } from "@/db/trade-filter";
import { computeAccountReturn } from "@/lib/risk-metrics";
import { authMiddleware } from "./auth-middleware";

const PAGE_SIZE = 50;

const filterSchema = tradeFilterSchema.extend({ page: z.number().default(1) });

export const getTrades = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(filterSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const where = tradeConditions(userId, data);

		const [rows, [{ total }]] = await Promise.all([
			db
				.select()
				.from(trades)
				.where(where)
				.orderBy(desc(trades.entryDate))
				.limit(PAGE_SIZE)
				.offset((data.page - 1) * PAGE_SIZE),
			db.select({ total: count() }).from(trades).where(where),
		]);

		return {
			trades: rows,
			total: Number(total),
			page: data.page,
			pageSize: PAGE_SIZE,
		};
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

		return {
			...trade,
			accountReturn: computeAccountReturn(
				{ ...trade, netPnl: Number(trade.netPnl ?? 0) },
				history.trades,
				history.cashFlows,
			),
		};
	});
