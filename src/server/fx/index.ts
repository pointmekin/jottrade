import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { fxRateCache } from "@/db/schema";
import { createFxRateResolver, type FxRateCacheStore } from "./fx-rate-service";

const databaseCache: FxRateCacheStore = {
	async get(query) {
		const [row] = await db
			.select()
			.from(fxRateCache)
			.where(
				and(
					eq(fxRateCache.provider, query.provider),
					eq(fxRateCache.fromCurrency, query.fromCurrency),
					eq(fxRateCache.toCurrency, query.toCurrency),
					eq(fxRateCache.rateKey, query.rateKey),
				),
			);
		if (!row) return null;
		return {
			provider: row.provider as "twelve_data" | "frankfurter",
			fromCurrency: row.fromCurrency,
			toCurrency: row.toCurrency,
			rateKey: row.rateKey,
			rate: Number(row.rate),
			asOf: row.asOf,
			precision: row.precision as "INTRADAY" | "DAILY",
		};
	},
	async put(entry) {
		await db
			.insert(fxRateCache)
			.values({
				provider: entry.provider,
				fromCurrency: entry.fromCurrency,
				toCurrency: entry.toCurrency,
				rateKey: entry.rateKey,
				rate: String(entry.rate),
				asOf: entry.asOf,
				precision: entry.precision,
			})
			.onConflictDoNothing({
				target: [
					fxRateCache.provider,
					fxRateCache.fromCurrency,
					fxRateCache.toCurrency,
					fxRateCache.rateKey,
				],
			});
	},
};

export const resolveFxRate = createFxRateResolver({ cache: databaseCache });
export type { FxRateResult, ResolveFxRateInput } from "./types";
