import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { trades } from "@/db/schema";
import { realizedAt } from "@/lib/analytics";
import { requireUserId } from "@/lib/auth";
import { currentExecutionFingerprint } from "@/lib/review-execution-fingerprint";
import { TradeStatus } from "@/lib/trade";

export const getReviewQueue = createServerFn({ method: "GET" })
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			openTrades: z.boolean().default(false),
			page: z.number().int().positive().default(1),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedPortfolio(userId, data.portfolioId);
		const rows = await db
			.select()
			.from(trades)
			.where(
				and(
					eq(trades.userId, userId),
					eq(trades.portfolioId, data.portfolioId),
				),
			);
		const checked = await Promise.all(
			rows.map(async (trade) => ({
				trade,
				reviewed:
					trade.reviewedAt !== null &&
					trade.reviewedExecutionFingerprint ===
						(await currentExecutionFingerprint(trade)),
			})),
		);
		const pending = checked
			.filter(
				({ trade, reviewed }) =>
					!reviewed &&
					(data.openTrades
						? trade.status !== TradeStatus.Closed
						: trade.status === TradeStatus.Closed),
			)
			.map(({ trade }) => trade)
			.sort(
				(a, b) =>
					realizedAt(a).getTime() - realizedAt(b).getTime() || a.id - b.id,
			);
		return {
			total: pending.length,
			trades: pending
				.slice((data.page - 1) * 50, data.page * 50)
				.map((trade) => ({
					id: trade.id,
					symbol: trade.symbol,
					realizedAt: realizedAt(trade),
					reviewedAt: trade.reviewedAt,
				})),
		};
	});
