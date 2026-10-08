import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { strategies, trades } from "@/db/schema";
import { summarizeGroup } from "@/lib/group-summary";
import { TradeStatus } from "@/lib/trade";
import { authMiddleware } from "./auth-middleware";

const strategyFieldsSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(1000).optional(),
});

const strategyIdSchema = z.object({ id: z.number() });

export const getStrategies = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { userId } = context;
		return db.select().from(strategies).where(eq(strategies.userId, userId));
	});

/** All time, over every closed trade of the strategy, so it does not depend on journal pages. */
export const getStrategyPerformance = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			strategyId: z.number().int().positive(),
		}),
	)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const rows = await db
			.select({ netPnl: trades.netPnl })
			.from(trades)
			.where(
				and(
					eq(trades.userId, userId),
					eq(trades.portfolioId, data.portfolioId),
					eq(trades.setupId, data.strategyId),
					eq(trades.status, TradeStatus.Closed),
				),
			);
		return summarizeGroup(rows.map((row) => Number(row.netPnl ?? 0)));
	});

export const createStrategy = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(strategyFieldsSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const [strategy] = await db
			.insert(strategies)
			.values({ ...data, userId })
			.returning();
		return strategy;
	});

export const updateStrategy = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(strategyFieldsSchema.extend(strategyIdSchema.shape))
	.handler(async ({ data: { id, ...fields }, context }) => {
		const { userId } = context;
		const [strategy] = await db
			.update(strategies)
			.set(fields)
			.where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
			.returning();
		if (!strategy) throw new Error("Strategy not found");
		return strategy;
	});

export const deleteStrategy = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(strategyIdSchema)
	.handler(async ({ data: { id }, context }) => {
		const { userId } = context;
		const results = await db.batch([
			db.execute(
				sql`SELECT id FROM portfolios WHERE user_id=${userId} ORDER BY id FOR UPDATE`,
			),
			db.execute(
				sql`SELECT id FROM trades WHERE user_id=${userId} AND setup_id=${id} ORDER BY id FOR UPDATE`,
			),
			db.execute(
				sql`WITH owned AS (SELECT id FROM strategies WHERE id=${id} AND user_id=${userId}), updated AS (UPDATE trades SET setup_id=NULL, edit_revision=edit_revision+1 WHERE setup_id=${id} AND user_id=${userId} AND EXISTS(SELECT 1 FROM owned) RETURNING id) DELETE FROM strategies WHERE id=${id} AND user_id=${userId} RETURNING id`,
			),
		]);
		if (!results[2].rows.length) throw new Error("Strategy not found");
		return { success: true };
	});
