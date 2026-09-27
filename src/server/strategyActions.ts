import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { strategies, trades } from "@/db/schema";
import { summarizeGroup, TradeStatus } from "@/lib/analytics";
import { auth } from "@/lib/auth";

export const getStrategies = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");
		return db
			.select()
			.from(strategies)
			.where(eq(strategies.userId, session.user.id));
	},
);

const strategyPerformanceSchema = z.object({
	portfolioId: z.number().int().positive(),
	strategyId: z.number().int().positive(),
});

/** All-time totals for one strategy in one account, over every closed trade. */
export const getStrategyPerformance = createServerFn({ method: "GET" })
	.validator(strategyPerformanceSchema)
	.handler(async ({ data }) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");
		const rows = await db
			.select({ netPnl: trades.netPnl })
			.from(trades)
			.where(
				and(
					eq(trades.userId, session.user.id),
					eq(trades.portfolioId, data.portfolioId),
					eq(trades.setupId, data.strategyId),
					eq(trades.status, TradeStatus.Closed),
				),
			);
		return summarizeGroup(rows.map((row) => Number(row.netPnl ?? 0)));
	});

const createStrategySchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(1000).optional(),
});

export const createStrategy = createServerFn({ method: "POST" }).handler(
	async (ctx: any) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");
		const data = createStrategySchema.parse(ctx.data);
		const [strategy] = await db
			.insert(strategies)
			.values({
				userId: session.user.id,
				name: data.name,
				description: data.description,
			})
			.returning();
		return strategy;
	},
);

const updateStrategySchema = z.object({
	id: z.number(),
	name: z.string().min(1).max(100),
	description: z.string().max(1000).optional(),
});

const deleteStrategySchema = z.object({ id: z.number() });

export const updateStrategy = createServerFn({ method: "POST" }).handler(
	async (ctx: any) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");
		const data = updateStrategySchema.parse(ctx.data);
		const setValues: Record<string, unknown> = { name: data.name };
		if (data.description !== undefined)
			setValues.description = data.description;
		const [strategy] = await db
			.update(strategies)
			.set(setValues)
			.where(
				and(eq(strategies.id, data.id), eq(strategies.userId, session.user.id)),
			)
			.returning();
		if (!strategy) throw new Error("Strategy not found");
		return strategy;
	},
);

export const deleteStrategy = createServerFn({ method: "POST" }).handler(
	async (ctx: any) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");
		const { id } = deleteStrategySchema.parse(ctx.data);
		// Transaction: nullify FK references first, then delete
		await db.transaction(async (tx) => {
			await tx
				.update(trades)
				.set({ setupId: null })
				.where(and(eq(trades.setupId, id), eq(trades.userId, session.user.id)));
			const [deleted] = await tx
				.delete(strategies)
				.where(
					and(eq(strategies.id, id), eq(strategies.userId, session.user.id)),
				)
				.returning();
			if (!deleted) throw new Error("Strategy not found");
		});
		return { success: true };
	},
);
