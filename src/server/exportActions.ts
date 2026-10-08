import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { loadArchiveTables } from "@/db/journal-archive";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { strategies, trades } from "@/db/schema";
import { tradeConditions, tradeFilterSchema } from "@/db/trade-filter";
import { withTags } from "@/db/trade-tags";
import { buildArchive } from "@/lib/archive";
import { exportFileName, tradesToCsv } from "@/lib/csv-export";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { authMiddleware } from "./auth-middleware";

export const exportTradesCsv = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(tradeFilterSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const account = await requireOwnedPortfolio(userId, data.portfolioId);
		const [rows, strategyRows] = await Promise.all([
			db
				.select()
				.from(trades)
				.where(tradeConditions(userId, data))
				.orderBy(desc(trades.entryDate), desc(trades.id)),
			db
				.select({ id: strategies.id, name: strategies.name })
				.from(strategies)
				.where(eq(strategies.userId, userId)),
		]);
		const now = new Date();
		return {
			fileName: exportFileName("trades", account.name, now, "csv"),
			csv: tradesToCsv(await withTags(userId, rows), {
				accountName: account.name,
				accountCurrency: account.currency ?? DEFAULT_CURRENCY,
				strategyNames: new Map(
					strategyRows.map((strategy) => [strategy.id, strategy.name]),
				),
			}),
			rowCount: rows.length,
		};
	});

export const exportArchive = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { userId } = context;
		const now = new Date();
		const archive = buildArchive(await loadArchiveTables(userId), now);
		return {
			fileName: exportFileName("archive", null, now, "json"),
			json: JSON.stringify(archive),
			counts: archive.counts,
		};
	});
