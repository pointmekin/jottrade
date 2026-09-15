import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { portfolios, trades } from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveFxRate } from "@/server/fx";
import {
	calculateTradeSnapshot,
	prepareTradeUpdate,
} from "@/server/trade-calculation";

const tradeSchema = z.object({
	symbol: z.string().min(1),
	side: z.enum(["LONG", "SHORT"]),
	entryDate: z.string().transform((str) => new Date(str)),
	entryPrice: z.string(),
	quantity: z.string(),
	notes: z.string().optional(),
	portfolioId: z.number().int().positive(),
	exitDate: z
		.string()
		.optional()
		.transform((str) => (str ? new Date(str) : undefined)),
	exitPrice: z
		.string()
		.optional()
		.transform((str) => (str?.trim() ? str : undefined)),
	fees: z
		.string()
		.optional()
		.transform((str) => (str?.trim() ? str : "0")),
	status: z.string().optional(),
});

const updateTradeSchema = tradeSchema.partial().extend({
	id: z.number(),
	confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
	mistake: z.string().optional(),
	setupId: z.number().nullable().optional(),
});

const deleteTradeSchema = z.object({ id: z.number() });

async function requirePortfolio(userId: string, portfolioId: number) {
	const [portfolio] = await db
		.select({ id: portfolios.id, currency: portfolios.currency })
		.from(portfolios)
		.where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)));
	if (!portfolio) throw new Error("Account not found.");
	return portfolio;
}

export const createTrade = createServerFn({ method: "POST" }).handler(
	async (ctx: unknown) => {
		const data = (ctx as { data: z.input<typeof tradeSchema> }).data;
		const validatedData = tradeSchema.parse(data);
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");

		const portfolio = await requirePortfolio(
			session.user.id,
			validatedData.portfolioId,
		);
		const calculation = await calculateTradeSnapshot({
			trade: {
				symbol: validatedData.symbol,
				side: validatedData.side,
				entryDate: validatedData.entryDate,
				exitDate: validatedData.exitDate ?? null,
				entryPrice: validatedData.entryPrice,
				exitPrice: validatedData.exitPrice ?? null,
				quantity: validatedData.quantity,
				fees: validatedData.fees,
			},
			accountCurrency: portfolio.currency ?? "USD",
			resolveExternalRate: resolveFxRate,
		});
		const status =
			validatedData.status ??
			(validatedData.exitPrice && validatedData.exitDate ? "CLOSED" : "OPEN");

		await db.insert(trades).values({
			userId: session.user.id,
			portfolioId: portfolio.id,
			symbol: validatedData.symbol,
			side: validatedData.side,
			entryDate: validatedData.entryDate,
			entryPrice: validatedData.entryPrice,
			quantity: validatedData.quantity,
			notes: validatedData.notes,
			exitDate: validatedData.exitDate,
			exitPrice: validatedData.exitPrice,
			fees: validatedData.fees,
			netPnl: calculation.netPnl,
			returnPercent: calculation.returnPercent,
			status,
			...calculation.snapshot,
		});

		return { success: true };
	},
);

export const updateTrade = createServerFn({ method: "POST" }).handler(
	async (ctx: unknown) => {
		const data = (ctx as { data: z.input<typeof updateTradeSchema> }).data;
		const validatedData = updateTradeSchema.parse(data);
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");

		const [existingTrade] = await db
			.select()
			.from(trades)
			.where(
				and(
					eq(trades.id, validatedData.id),
					eq(trades.userId, session.user.id),
				),
			);
		if (!existingTrade) throw new Error("Trade not found");

		const portfolioId = validatedData.portfolioId ?? existingTrade.portfolioId;
		const portfolio = await requirePortfolio(session.user.id, portfolioId);
		const calculation = await prepareTradeUpdate({
			existing: {
				...existingTrade,
				side: existingTrade.side as "LONG" | "SHORT",
			},
			patch: validatedData,
			accountCurrency: portfolio.currency ?? "USD",
			resolveExternalRate: resolveFxRate,
		});

		const status =
			validatedData.status ??
			(validatedData.exitPrice ? "CLOSED" : existingTrade.status);
		const setValues: Partial<typeof trades.$inferInsert> = { status };
		if (calculation) {
			setValues.netPnl = calculation.netPnl;
			setValues.returnPercent = calculation.returnPercent;
			Object.assign(setValues, calculation.snapshot);
		}
		if (validatedData.symbol !== undefined)
			setValues.symbol = validatedData.symbol;
		if (validatedData.side !== undefined) setValues.side = validatedData.side;
		if (validatedData.entryDate !== undefined)
			setValues.entryDate = validatedData.entryDate;
		if (validatedData.entryPrice !== undefined)
			setValues.entryPrice = validatedData.entryPrice;
		if (validatedData.quantity !== undefined)
			setValues.quantity = validatedData.quantity;
		if (validatedData.exitDate !== undefined)
			setValues.exitDate = validatedData.exitDate;
		if (validatedData.exitPrice !== undefined)
			setValues.exitPrice = validatedData.exitPrice;
		if (validatedData.fees !== undefined) setValues.fees = validatedData.fees;
		if (validatedData.portfolioId !== undefined)
			setValues.portfolioId = validatedData.portfolioId;
		if (validatedData.notes !== undefined)
			setValues.notes = validatedData.notes;
		if (validatedData.confidence !== undefined)
			setValues.confidence = validatedData.confidence;
		if (validatedData.mistake !== undefined)
			setValues.mistake = validatedData.mistake;
		if ("setupId" in validatedData) setValues.setupId = validatedData.setupId;

		await db
			.update(trades)
			.set(setValues)
			.where(
				and(
					eq(trades.id, validatedData.id),
					eq(trades.userId, session.user.id),
				),
			);

		return { success: true };
	},
);

export const deleteTrade = createServerFn({ method: "POST" })
	.validator(deleteTradeSchema)
	.handler(async ({ data }) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");

		await db
			.delete(trades)
			.where(and(eq(trades.id, data.id), eq(trades.userId, session.user.id)));

		return { success: true };
	});
