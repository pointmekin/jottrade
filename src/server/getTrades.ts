import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { loadAccountHistory } from "@/db/account-history";
import { trades } from "@/db/schema";
import { tradeConditions, tradeFilterSchema } from "@/db/trade-filter";
import { loadTagsByTrade, withTags } from "@/db/trade-tags";
import { requireUserId } from "@/lib/auth";
import { computeAccountReturn } from "@/lib/risk-metrics";
import { BULK_EDIT_LIMIT } from "@/lib/trade-tag";

const PAGE_SIZE = 50;

const filterSchema = tradeFilterSchema.extend({ page: z.number().default(1) });

export const getTrades = createServerFn({ method: "GET" })
	.validator(filterSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
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
			trades: await withTags(userId, rows),
			total: Number(total),
			page: data.page,
			pageSize: PAGE_SIZE,
		};
	});

/** Every trade id that matches the filter, for "select all matching"; capped one above the bulk limit so the client can tell when it is exceeded. */
export const getTradeIds = createServerFn({ method: "GET" })
	.validator(tradeFilterSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const rows = await db
			.select({ id: trades.id })
			.from(trades)
			.where(tradeConditions(userId, data))
			.orderBy(desc(trades.entryDate), desc(trades.id))
			.limit(BULK_EDIT_LIMIT + 1);
		return rows.map((row) => row.id);
	});

export const getTradeById = createServerFn({ method: "GET" })
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			id: z.coerce.number().int().positive(),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
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
