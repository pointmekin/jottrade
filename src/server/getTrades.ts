import { createServerFn } from "@tanstack/react-start";
import {
	and,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	like,
	lte,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { loadAccountHistory } from "@/db/account-history";
import { trades } from "@/db/schema";
import { computeAccountReturn } from "@/lib/risk-metrics";
import { requireUserId } from "@/lib/auth";
import { TradeConfidence, TradeSide, TradeStatus } from "@/lib/trade";

const PAGE_SIZE = 50;

const filterSchema = z.object({
	portfolioId: z.number().int().positive(),
	symbol: z.string().optional(),
	side: z.enum(TradeSide).optional(),
	status: z.enum(TradeStatus).optional(),
	setupId: z.union([z.number(), z.literal("none")]).optional(),
	confidence: z.array(z.enum(TradeConfidence)).optional(),
	mistake: z.array(z.string()).optional(),
	dateFrom: z.string().optional(),
	dateTo: z.string().optional(),
	page: z.number().default(1),
});

type TradeFilter = z.infer<typeof filterSchema>;

function setupCondition(setupId: TradeFilter["setupId"]) {
	if (setupId === "none") return isNull(trades.setupId);
	if (setupId === undefined) return undefined;
	return eq(trades.setupId, setupId);
}

function tradeConditions(userId: string, filter: TradeFilter) {
	return and(
		eq(trades.userId, userId),
		eq(trades.portfolioId, filter.portfolioId),
		filter.symbol ? like(trades.symbol, `%${filter.symbol}%`) : undefined,
		filter.side ? eq(trades.side, filter.side) : undefined,
		filter.status ? eq(trades.status, filter.status) : undefined,
		setupCondition(filter.setupId),
		filter.confidence?.length
			? inArray(trades.confidence, filter.confidence)
			: undefined,
		filter.mistake?.length ? inArray(trades.mistake, filter.mistake) : undefined,
		filter.dateFrom
			? gte(trades.entryDate, new Date(filter.dateFrom))
			: undefined,
		filter.dateTo ? lte(trades.entryDate, new Date(filter.dateTo)) : undefined,
	);
}

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
			trades: rows,
			total: Number(total),
			page: data.page,
			pageSize: PAGE_SIZE,
		};
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

		return {
			...trade,
			accountReturn: computeAccountReturn(
				{ ...trade, netPnl: Number(trade.netPnl ?? 0) },
				history.trades,
				history.cashFlows,
			),
		};
	});
