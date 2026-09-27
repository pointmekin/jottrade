import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { strategies, trades } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { summarizeGroup } from "@/lib/group-summary";
import { TradeStatus } from "@/lib/trade";

const strategyFieldsSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(1000).optional(),
});

const strategyIdSchema = z.object({ id: z.number() });

export const getStrategies = createServerFn({ method: "GET" }).handler(
	async () => {
		const userId = await requireUserId();
		return db.select().from(strategies).where(eq(strategies.userId, userId));
	},
);

/** All time, over every closed trade of the strategy, so it does not depend on journal pages. */
export const getStrategyPerformance = createServerFn({ method: "GET" })
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			strategyId: z.number().int().positive(),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
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
	.validator(strategyFieldsSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const [strategy] = await db
			.insert(strategies)
			.values({ ...data, userId })
			.returning();
		return strategy;
	});

export const updateStrategy = createServerFn({ method: "POST" })
	.validator(strategyFieldsSchema.extend(strategyIdSchema.shape))
	.handler(async ({ data: { id, ...fields } }) => {
		const userId = await requireUserId();
		const [strategy] = await db
			.update(strategies)
			.set(fields)
			.where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
			.returning();
		if (!strategy) throw new Error("Strategy not found");
		return strategy;
	});

export const deleteStrategy = createServerFn({ method: "POST" })
	.validator(strategyIdSchema)
	.handler(async ({ data: { id } }) => {
		const userId = await requireUserId();
		await db.transaction(async (tx) => {
			await tx
				.update(trades)
				.set({ setupId: null })
				.where(and(eq(trades.setupId, id), eq(trades.userId, userId)));
			const [deleted] = await tx
				.delete(strategies)
				.where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
				.returning();
			if (!deleted) throw new Error("Strategy not found");
		});
		return { success: true };
	});
