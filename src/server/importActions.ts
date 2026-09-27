import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { portfolios, trades } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { calculateInstrumentPnL, priceReturnPercent } from "@/lib/finance";
import { TradeSide, TradeStatus } from "@/lib/trade";

const importTradeSchema = z.object({
	symbol: z.string().min(1),
	side: z.string(),
	entryDate: z.string().or(z.date()),
	entryPrice: z.string().or(z.number()),
	quantity: z.string().or(z.number()),
	exitDate: z.string().or(z.date()).optional(),
	exitPrice: z.string().or(z.number()).optional(),
	fees: z.string().or(z.number()).optional(),
	netPnl: z.string().or(z.number()).optional(),
	notes: z.string().optional(),
});

type ImportTrade = z.infer<typeof importTradeSchema>;

async function sha256(text: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(text),
	);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function toTradeRow(item: ImportTrade, accountCurrency: string) {
	const side = item.side.toLowerCase().includes("buy")
		? TradeSide.Long
		: TradeSide.Short;
	const entryPrice = String(item.entryPrice);
	const exitPrice = item.exitPrice ? String(item.exitPrice) : null;
	const quantity = String(item.quantity);
	const fees = item.fees ? String(item.fees) : "0";
	const exitDate = item.exitDate ? new Date(item.exitDate) : null;
	const reportedPnl =
		item.netPnl === undefined ? "" : String(item.netPnl).trim();
	// Analytics needs an exit time to place a closed trade on the curve.
	const isClosed = Boolean(entryPrice && exitPrice && exitDate);

	let netPnl = reportedPnl === "" ? undefined : reportedPnl;
	let returnPercent: string | undefined;
	if (exitPrice && isClosed) {
		returnPercent = priceReturnPercent(
			side,
			Number(entryPrice),
			Number(exitPrice),
		)?.toFixed(2);
		netPnl ??= calculateInstrumentPnL({
			symbol: item.symbol,
			accountCurrency,
			side,
			entryPrice: Number(entryPrice),
			exitPrice: Number(exitPrice),
			quantity: Number(quantity),
			feesAccount: Number(fees),
		}).netPnl;
	}

	return {
		symbol: item.symbol.toUpperCase(),
		side,
		entryDate: new Date(item.entryDate),
		entryPrice,
		quantity,
		exitDate,
		exitPrice,
		fees,
		status: isClosed ? TradeStatus.Closed : TradeStatus.Open,
		netPnl,
		returnPercent,
		notes: item.notes,
	};
}

type TradeRow = ReturnType<typeof toTradeRow>;

/** A ticket is not unique: a position can close in several partial fills, so the exit leg is part of the key. */
function importHash(userId: string, row: TradeRow) {
	return sha256(
		[
			userId,
			row.symbol,
			row.side,
			row.entryDate.toISOString(),
			row.exitDate?.toISOString(),
			row.entryPrice,
			row.exitPrice,
			row.quantity,
		]
			.map((part) => part ?? "")
			.join("|"),
	);
}

export const importTrades = createServerFn({ method: "POST" })
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			trades: z.array(importTradeSchema).min(1).max(5000),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const [portfolio] = await db
			.select({ currency: portfolios.currency })
			.from(portfolios)
			.where(
				and(
					eq(portfolios.id, data.portfolioId),
					eq(portfolios.userId, userId),
				),
			);
		if (!portfolio) throw new Error("Account not found.");

		const rows = data.trades.map((item) =>
			toTradeRow(item, portfolio.currency ?? DEFAULT_CURRENCY),
		);
		const values = await Promise.all(
			rows.map(async (row) => ({
				...row,
				userId,
				portfolioId: data.portfolioId,
				importHash: await importHash(userId, row),
			})),
		);

		const inserted = await db
			.insert(trades)
			.values(values)
			.onConflictDoNothing({ target: trades.importHash })
			.returning({ id: trades.id });

		return {
			success: true,
			count: inserted.length,
			skipped: values.length - inserted.length,
		};
	});
