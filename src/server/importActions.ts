import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { auth } from "@/lib/auth";
import { calculatePnL } from "@/lib/finance";

// Schema that matches our DB structure mostly, but allows for bulk array
const importTradeSchema = z.object({
	symbol: z.string().min(1),
	side: z.string(), // "buy" / "sell" -> needs mapping
	entryDate: z.string().or(z.date()),
	entryPrice: z.string().or(z.number()),
	quantity: z.string().or(z.number()),

	exitDate: z.string().or(z.date()).optional(),
	exitPrice: z.string().or(z.number()).optional(),

	fees: z.string().or(z.number()).optional(),
	netPnl: z.string().or(z.number()).optional(),

	notes: z.string().optional(), // We will put ticket ID here
});

/**
 * Stable identity of one fill. A broker ticket alone is not unique because a
 * position can close in several partial fills, so the exit leg is part of the key.
 */
async function buildImportHash(parts: (string | null | undefined)[]) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(parts.map((p) => p ?? "").join("|")),
	);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export const importTrades = createServerFn({ method: "POST" })
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			trades: z.array(importTradeSchema).min(1).max(5000),
		}),
	)
	.handler(async ({ data }) => {
		const input = data.trades;

		const session = await auth.api.getSession({
			headers: getRequestHeaders(),
		});

		if (!session) {
			throw new Error("Unauthorized");
		}

		const valuesToInsert: (typeof trades.$inferInsert)[] = [];

		for (const item of input) {
			// Map fields
			const side = item.side.toLowerCase().includes("buy") ? "LONG" : "SHORT";

			const entryPriceStr = String(item.entryPrice);
			const exitPriceStr = item.exitPrice ? String(item.exitPrice) : null;

			// Restore these variables required for fallback calculation and insertion
			const quantityStr = String(item.quantity);
			const feesStr = item.fees ? String(item.fees) : "0";

			// A reported net P&L of exactly 0 is a scratch trade, not a missing value.
			const rawNetPnl =
				item.netPnl === undefined ? "" : String(item.netPnl).trim();
			let netPnl = rawNetPnl === "" ? undefined : rawNetPnl;
			let returnPercent;
			let status = "OPEN";
			const exitDate = item.exitDate ? new Date(item.exitDate) : null;

			// Analytics needs an exit timestamp to place a closed trade on the curve.
			if (exitPriceStr && entryPriceStr && exitDate) {
				status = "CLOSED";

				// ROI Logic: Price Change %
				// Since we don't know the margin/leverage, calculating ROI on Equity is impossible without that data.
				// Converting to "Price Return" is the standard fallback.
				const en = parseFloat(entryPriceStr);
				const ex = parseFloat(exitPriceStr);

				if (!isNaN(en) && !isNaN(ex) && en !== 0) {
					// (Exit - Entry) / Entry
					let diffPct = ((ex - en) / en) * 100;
					// If SHORT, Entry > Exit is good. (Entry - Exit) / Entry = -((Exit - Entry)/Entry)
					// So if Short, flip the sign.
					if (side === "SHORT") diffPct = -diffPct;
					returnPercent = diffPct.toFixed(2);
				}

				if (!netPnl) {
					// Only calculate manual PnL if NOT provided by CSV.
					// This fallback assumes stock-like math (Qty * PriceDiff).
					const pnl = calculatePnL(
						side,
						entryPriceStr,
						exitPriceStr,
						quantityStr,
						feesStr,
						item.symbol,
					);
					netPnl = pnl.netPnl;
					if (!returnPercent) returnPercent = pnl.returnPercent;
				}
			}

			const entryDate = new Date(item.entryDate);
			const symbol = item.symbol.toUpperCase();

			valuesToInsert.push({
				userId: session.user.id,
				portfolioId: data.portfolioId,
				symbol,
				side,
				entryDate,
				entryPrice: entryPriceStr,
				quantity: quantityStr,

				exitDate,
				exitPrice: exitPriceStr,
				fees: feesStr,

				status,
				netPnl,
				returnPercent,
				notes: item.notes,
				importHash: await buildImportHash([
					session.user.id,
					symbol,
					side,
					entryDate.toISOString(),
					exitDate?.toISOString(),
					entryPriceStr,
					exitPriceStr,
					quantityStr,
				]),
			});
		}

		let inserted = 0;
		if (valuesToInsert.length > 0) {
			const rows = await db
				.insert(trades)
				.values(valuesToInsert)
				.onConflictDoNothing({ target: trades.importHash })
				.returning({ id: trades.id });
			inserted = rows.length;
		}

		return {
			success: true,
			count: inserted,
			skipped: valuesToInsert.length - inserted,
		};
	});
