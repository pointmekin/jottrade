import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { strategies, trades } from "@/db/schema";
import { summarizeGroup } from "@/lib/group-summary";
import { playbookFieldsSchema } from "@/lib/playbook";
import { TradeStatus } from "@/lib/trade";
import { authMiddleware } from "./auth-middleware";

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
	.validator(playbookFieldsSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const [strategy] = await db
			.insert(strategies)
			.values({ ...data, riskGuidance: data.riskGuidance || null, userId })
			.returning();
		return strategy;
	});

export const updateStrategy = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(playbookFieldsSchema.extend(strategyIdSchema.shape))
	.handler(async ({ data: { id, ...fields }, context }) => {
		const { userId } = context;
		const riskGuidance = fields.riskGuidance || null;
		const [strategy] = await db
			.update(strategies)
			.set({
				...fields,
				riskGuidance,
				criteriaVersion: sql`CASE WHEN ${strategies.criteria} IS DISTINCT FROM ${JSON.stringify(fields.criteria)}::jsonb OR ${strategies.riskGuidance} IS DISTINCT FROM ${riskGuidance} THEN ${strategies.criteriaVersion} + 1 ELSE ${strategies.criteriaVersion} END`,
			})
			.where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
			.returning();
		if (!strategy) throw new Error("Strategy not found");
		return strategy;
	});

export const archiveStrategy = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(strategyIdSchema.extend({ archived: z.boolean() }))
	.handler(async ({ data: { id, archived }, context }) => {
		const { userId } = context;
		const [strategy] = await db
			.update(strategies)
			.set({
				archivedAt: archived
					? sql`COALESCE(${strategies.archivedAt}, now())`
					: null,
			})
			.where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
			.returning();
		if (!strategy) throw new Error("Strategy not found");
		return strategy;
	});

/** A used strategy is archived, not deleted, so its trades keep their history. */
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
				sql`WITH owned AS (SELECT id FROM strategies WHERE id=${id} AND user_id=${userId}), used AS (SELECT count(*)::int AS n FROM trades WHERE setup_id=${id} AND user_id=${userId}), deleted AS (DELETE FROM strategies WHERE id IN (SELECT id FROM owned) AND (SELECT n FROM used)=0 RETURNING id) SELECT (SELECT count(*) FROM owned)::int AS owned, (SELECT n FROM used) AS used`,
			),
		]);
		const [{ owned, used }] = results[2].rows as {
			owned: number;
			used: number;
		}[];
		if (!owned) throw new Error("Strategy not found");
		if (used) {
			const uses = used === 1 ? "1 trade uses" : `${used} trades use`;
			throw new Error(`${uses} this strategy. Archive it instead.`);
		}
		return { success: true };
	});
