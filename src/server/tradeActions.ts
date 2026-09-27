import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { trades } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { calculateInstrumentPnL, shouldRecalculatePnl } from "@/lib/finance";
import { TradeConfidence, TradeSide, TradeStatus } from "@/lib/trade";

const tradeSchema = z.object({
	symbol: z.string().min(1),
	side: z.enum(TradeSide),
	entryDate: z.string().transform((str) => new Date(str)),
	entryPrice: z.string(),
	targetPrice: z
		.string()
		.trim()
		.refine(
			(value) =>
				value === "" || (Number.isFinite(Number(value)) && Number(value) > 0),
			"Target price must be positive.",
		)
		.nullable()
		.optional(),
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
	status: z.enum(TradeStatus).optional(),
});

const updateTradeSchema = tradeSchema.partial().extend({
	id: z.number(),
	confidence: z.enum(TradeConfidence).optional(),
	mistake: z.string().optional(),
	setupId: z.number().nullable().optional(),
});

type ExistingTrade = typeof trades.$inferSelect;
type TradeChanges = Omit<z.infer<typeof updateTradeSchema>, "id">;

function recalculatePnl(
	existing: ExistingTrade,
	changes: TradeChanges,
	accountCurrency: string,
) {
	const merged = {
		symbol: changes.symbol || existing.symbol,
		side: changes.side || existing.side,
		entryPrice: changes.entryPrice || existing.entryPrice,
		exitPrice: changes.exitPrice || existing.exitPrice,
		quantity: changes.quantity || existing.quantity,
		fees: changes.fees || existing.fees || "0",
	};
	const canRecalculate =
		shouldRecalculatePnl(existing.importHash) &&
		merged.exitPrice &&
		merged.entryPrice &&
		merged.quantity;
	if (!canRecalculate) {
		return {
			netPnl: existing.netPnl,
			returnPercent: existing.returnPercent,
			isRecalculated: false,
		};
	}
	const pnl = calculateInstrumentPnL({
		symbol: merged.symbol,
		accountCurrency,
		side: merged.side,
		entryPrice: Number(merged.entryPrice),
		exitPrice: Number(merged.exitPrice),
		quantity: Number(merged.quantity),
		feesAccount: Number(merged.fees),
	});
	return { ...pnl, isRecalculated: true };
}

export const createTrade = createServerFn({ method: "POST" })
	.validator(tradeSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const portfolio = await requireOwnedPortfolio(userId, data.portfolioId);

		const isClosing = Boolean(data.exitPrice && data.entryPrice);
		const pnl = isClosing
			? calculateInstrumentPnL({
					symbol: data.symbol,
					accountCurrency: portfolio.currency ?? DEFAULT_CURRENCY,
					side: data.side,
					entryPrice: Number(data.entryPrice),
					exitPrice: Number(data.exitPrice),
					quantity: Number(data.quantity),
					feesAccount: Number(data.fees),
				})
			: undefined;

		await db.insert(trades).values({
			...data,
			userId,
			targetPrice: data.targetPrice || null,
			netPnl: pnl?.netPnl,
			returnPercent: pnl?.returnPercent,
			status:
				data.status ?? (isClosing ? TradeStatus.Closed : TradeStatus.Open),
		});

		return { success: true };
	});

export const updateTrade = createServerFn({ method: "POST" })
	.validator(updateTradeSchema)
	.handler(async ({ data: { id, ...changes } }) => {
		const userId = await requireUserId();
		const [existing] = await db
			.select()
			.from(trades)
			.where(and(eq(trades.id, id), eq(trades.userId, userId)));
		if (!existing) throw new Error("Trade not found");

		const portfolio = await requireOwnedPortfolio(
			userId,
			changes.portfolioId ?? existing.portfolioId,
		);
		const { netPnl, returnPercent, isRecalculated } = recalculatePnl(
			existing,
			changes,
			portfolio.currency ?? DEFAULT_CURRENCY,
		);
		const closesNow = isRecalculated && changes.exitPrice && !changes.status;
		const status = closesNow
			? TradeStatus.Closed
			: (changes.status ?? existing.status);

		await db
			.update(trades)
			.set({
				...changes,
				targetPrice: changes.targetPrice === "" ? null : changes.targetPrice,
				status,
				netPnl,
				returnPercent,
			})
			.where(eq(trades.id, id));

		return { success: true };
	});

export const deleteTrade = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await db
			.delete(trades)
			.where(and(eq(trades.id, data.id), eq(trades.userId, userId)));
		return { success: true };
	});
