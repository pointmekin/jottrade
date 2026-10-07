import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { loadArchiveTables } from "@/db/journal-archive";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { strategies, trades } from "@/db/schema";
import { tradeConditions, tradeFilterSchema } from "@/db/trade-filter";
import { buildArchive } from "@/lib/archive";
import { requireUserId } from "@/lib/auth";
import { exportFileName, tradesToCsv } from "@/lib/csv-export";

export const exportTradesCsv = createServerFn({ method: "POST" })
	.validator(tradeFilterSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
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
			csv: tradesToCsv(rows, {
				accountName: account.name,
				accountCurrency: account.currency ?? "",
				strategyNames: new Map(
					strategyRows.map((strategy) => [strategy.id, strategy.name]),
				),
			}),
			rowCount: rows.length,
		};
	});

export const exportArchive = createServerFn({ method: "POST" }).handler(
	async () => {
		const userId = await requireUserId();
		const now = new Date();
		const archive = buildArchive(await loadArchiveTables(userId), now);
		return {
			fileName: exportFileName("archive", null, now, "json"),
			json: JSON.stringify(archive, null, 2),
			counts: archive.counts,
		};
	},
);
