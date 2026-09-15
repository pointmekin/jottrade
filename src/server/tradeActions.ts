import { createServerFn } from "@tanstack/react-start";
// import { getWebRequest } from 'vinxi/http';
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { auth } from "@/lib/auth";
import { calculatePnL, shouldRecalculatePnl } from "@/lib/finance";

const tradeSchema = z.object({
	symbol: z.string().min(1),
	side: z.enum(["LONG", "SHORT"]),
	entryDate: z.string().transform((str) => new Date(str)), // Input as string from form
	entryPrice: z.string(), // Ensure string for numeric
	quantity: z.string(),
	notes: z.string().optional(),
	portfolioId: z.number().int().positive(),

	// Optional Exit fields for "Closed" entry or updates
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
	status: z.string().optional(), // OPEN, CLOSED, PENDING
});

// For update, we might need ID
const updateTradeSchema = tradeSchema.partial().extend({
	id: z.number(),
	confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
	mistake: z.string().optional(),
	setupId: z.number().nullable().optional(),
	// notes already in tradeSchema
});

const deleteTradeSchema = z.object({
	id: z.number(),
});

export const createTrade = createServerFn({ method: "POST" }).handler(
	async (ctx: any) => {
		const data = ctx.data as z.infer<typeof tradeSchema>;
		// Validate manually if needed, or trust the type if client sends strictly
		// If "data" is the raw payload here
		const validatedData = tradeSchema.parse(data);
		// const request = getWebRequest();
		const session = await auth.api.getSession({
			headers: getRequestHeaders(),
		});

		if (!session) {
			throw new Error("Unauthorized");
		}

		const portfolioId = validatedData.portfolioId;

		// Calculate P&L if exit exists
		let netPnl;
		let returnPercent;
		let status = validatedData.status || "OPEN";

		if (validatedData.exitPrice && validatedData.entryPrice) {
			const pnl = calculatePnL(
				validatedData.side,
				validatedData.entryPrice,
				validatedData.exitPrice,
				validatedData.quantity,
				validatedData.fees,
				validatedData.symbol,
			);
			netPnl = pnl.netPnl;
			returnPercent = pnl.returnPercent;
			if (!validatedData.status) status = "CLOSED";
		}

		await db.insert(trades).values({
			userId: session.user.id,
			portfolioId: portfolioId,
			symbol: validatedData.symbol,
			side: validatedData.side,
			entryDate: validatedData.entryDate,
			entryPrice: validatedData.entryPrice,
			quantity: validatedData.quantity,
			notes: validatedData.notes,

			exitDate: validatedData.exitDate,
			exitPrice: validatedData.exitPrice,
			fees: validatedData.fees,

			netPnl,
			returnPercent,
			status,
		});

		return { success: true };
	},
);

export const updateTrade = createServerFn({ method: "POST" }).handler(
	async (ctx: any) => {
		const data = ctx.data as z.infer<typeof updateTradeSchema>;
		const validatedData = updateTradeSchema.parse(data);
		const session = await auth.api.getSession({
			headers: getRequestHeaders(),
		});

		if (!session) {
			throw new Error("Unauthorized");
		}

		// Fetch existing trade to merge/recalc?
		// For simplicity, we assume frontend sends necessary data or we just update fields present.
		// But P&L calc needs entry price if we are just updating exit price.
		// So let's fetch it.
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

		const side = validatedData.side || (existingTrade.side as "LONG" | "SHORT");
		const entryPrice = validatedData.entryPrice || existingTrade.entryPrice;
		const exitPrice = validatedData.exitPrice || existingTrade.exitPrice;
		const quantity = validatedData.quantity || existingTrade.quantity;
		const fees = validatedData.fees || existingTrade.fees;

		let netPnl = existingTrade.netPnl;
		let returnPercent = existingTrade.returnPercent;
		let status = validatedData.status || existingTrade.status;

		if (
			shouldRecalculatePnl(existingTrade.importHash) &&
			exitPrice &&
			entryPrice &&
			quantity
		) {
			const pnl = calculatePnL(
				side,
				entryPrice,
				exitPrice,
				quantity,
				fees || "0",
				validatedData.symbol || existingTrade.symbol,
			); // Ensure fees is string
			netPnl = pnl.netPnl;
			returnPercent = pnl.returnPercent;
			// Auto-close if exit details filled?
			if (validatedData.exitPrice && !validatedData.status) status = "CLOSED";
		}

		// Build set object conditionally — Drizzle does NOT skip undefined in .set(), it sets to NULL.
		const setValues: Record<string, any> = { status, netPnl, returnPercent };
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
		// Psychology fields
		if (validatedData.confidence !== undefined)
			setValues.confidence = validatedData.confidence;
		if (validatedData.mistake !== undefined)
			setValues.mistake = validatedData.mistake;
		if ("setupId" in validatedData) setValues.setupId = validatedData.setupId; // allow null

		await db
			.update(trades)
			.set(setValues)
			.where(eq(trades.id, validatedData.id));

		return { success: true };
	},
);

export const deleteTrade = createServerFn({ method: "POST" })
	.validator(deleteTradeSchema)
	.handler(async ({ data }) => {
		const session = await auth.api.getSession({
			headers: getRequestHeaders(),
		});
		if (!session) throw new Error("Unauthorized");

		await db
			.delete(trades)
			.where(and(eq(trades.id, data.id), eq(trades.userId, session.user.id)));

		return { success: true };
	});
