import { describe, expect, it, vi } from "vitest";
import {
	calculateTradeSnapshot,
	prepareTradeUpdate,
	type StoredTradeCalculation,
} from "@/server/trade-calculation";

const closedTrade = {
	symbol: "EURJPY",
	side: "LONG" as const,
	entryDate: new Date("2026-09-15T08:32:10.000Z"),
	exitDate: new Date("2026-09-15T09:45:20.000Z"),
	entryPrice: "170",
	exitPrice: "171",
	quantity: "1",
	fees: "2",
};

const existingCalculation: StoredTradeCalculation = {
	quantityUnit: "LOTS",
	contractSize: "100000",
	baseCurrency: "EUR",
	quoteCurrency: "JPY",
	pnlCurrency: "USD",
	entryConversionRate: "0.0067",
	entryConversionSource: "TWELVE_DATA",
	entryConversionAsOf: new Date("2026-09-15T08:32:00.000Z"),
	exitConversionRate: "0.0068",
	exitConversionSource: "TWELVE_DATA",
	exitConversionAsOf: new Date("2026-09-15T09:45:00.000Z"),
};

describe("trade calculation snapshots", () => {
	it.each([
		{ symbol: "EURUSD", entryPrice: "1.1", exitPrice: "1.2" },
		{ symbol: "USDJPY", entryPrice: "150", exitPrice: "151" },
	])("calculates $symbol locally without provider calls", async (trade) => {
		const resolveExternalRate = vi.fn();

		const result = await calculateTradeSnapshot({
			trade: { ...closedTrade, ...trade },
			accountCurrency: "USD",
			resolveExternalRate,
		});

		expect(resolveExternalRate).not.toHaveBeenCalled();
		expect(result.netPnl).toBeDefined();
		expect(result.snapshot.pnlCurrency).toBe("USD");
	});

	it("uses the instrument-price conversion for a EUR account", async () => {
		const resolveExternalRate = vi.fn();

		const result = await calculateTradeSnapshot({
			trade: {
				...closedTrade,
				symbol: "EURUSD",
				entryPrice: "1.1",
				exitPrice: "1.2",
			},
			accountCurrency: "EUR",
			resolveExternalRate,
		});

		expect(resolveExternalRate).not.toHaveBeenCalled();
		expect(result.snapshot.entryConversionSource).toBe("INSTRUMENT_PRICE");
		expect(Number(result.snapshot.entryConversionRate)).toBeCloseTo(1 / 1.1);
	});

	it("requests the quote-to-account pair for a non-USD cross", async () => {
		const resolveExternalRate = vi.fn(
			async ({ fromCurrency, toCurrency, at }) => ({
				fromCurrency,
				toCurrency,
				rate: 0.006,
				provider: "twelve_data" as const,
				asOf: at,
				precision: "INTRADAY" as const,
			}),
		);

		await calculateTradeSnapshot({
			trade: { ...closedTrade, symbol: "GBPJPY" },
			accountCurrency: "EUR",
			resolveExternalRate,
		});

		expect(resolveExternalRate).toHaveBeenCalledWith(
			expect.objectContaining({ fromCurrency: "JPY", toCurrency: "EUR" }),
		);
	});

	it("uses at most one external request for legs in the same minute", async () => {
		const resolveExternalRate = vi.fn(async () => ({
			fromCurrency: "JPY",
			toCurrency: "USD",
			rate: 0.0067,
			provider: "twelve_data" as const,
			asOf: new Date("2026-09-15T08:32:00.000Z"),
			precision: "INTRADAY" as const,
		}));

		await calculateTradeSnapshot({
			trade: {
				...closedTrade,
				exitDate: new Date("2026-09-15T08:32:55.000Z"),
			},
			accountCurrency: "USD",
			resolveExternalRate,
		});

		expect(resolveExternalRate).toHaveBeenCalledTimes(1);
	});

	it("reuses both rates for a quantity edit", async () => {
		const resolveExternalRate = vi.fn();

		const result = await prepareTradeUpdate({
			existing: { ...closedTrade, ...existingCalculation, importHash: null },
			patch: { quantity: "2" },
			accountCurrency: "USD",
			resolveExternalRate,
		});

		expect(resolveExternalRate).not.toHaveBeenCalled();
		expect(result?.snapshot.entryConversionRate).toBe("0.0067");
		expect(result?.snapshot.exitConversionRate).toBe("0.0068");
	});

	it("does no calculation or provider work for a notes edit", async () => {
		const resolveExternalRate = vi.fn();

		const result = await prepareTradeUpdate({
			existing: { ...closedTrade, ...existingCalculation, importHash: null },
			patch: { notes: "Reviewed" },
			accountCurrency: "USD",
			resolveExternalRate,
		});

		expect(result).toBeNull();
		expect(resolveExternalRate).not.toHaveBeenCalled();
	});

	it("refreshes only an externally sourced entry leg after entry date changes", async () => {
		const resolveExternalRate = vi.fn(async () => ({
			fromCurrency: "JPY",
			toCurrency: "USD",
			rate: 0.0069,
			provider: "frankfurter" as const,
			asOf: new Date("2026-09-16T00:00:00.000Z"),
			precision: "DAILY" as const,
		}));

		const result = await prepareTradeUpdate({
			existing: { ...closedTrade, ...existingCalculation, importHash: null },
			patch: { entryDate: new Date("2026-09-16T08:32:10.000Z") },
			accountCurrency: "USD",
			resolveExternalRate,
		});

		expect(resolveExternalRate).toHaveBeenCalledTimes(1);
		expect(resolveExternalRate).toHaveBeenCalledWith(
			expect.objectContaining({ at: new Date("2026-09-16T08:32:10.000Z") }),
		);
		expect(result?.snapshot.entryConversionSource).toBe("FRANKFURTER");
		expect(result?.snapshot.exitConversionRate).toBe("0.0068");
	});

	it("updates an instrument-price leg locally when its price changes", async () => {
		const resolveExternalRate = vi.fn();
		const localSnapshot: StoredTradeCalculation = {
			...existingCalculation,
			baseCurrency: "USD",
			entryConversionRate: String(1 / 150),
			entryConversionSource: "INSTRUMENT_PRICE",
			exitConversionRate: String(1 / 151),
			exitConversionSource: "INSTRUMENT_PRICE",
		};

		const result = await prepareTradeUpdate({
			existing: {
				...closedTrade,
				symbol: "USDJPY",
				...localSnapshot,
				importHash: null,
			},
			patch: { entryPrice: "160" },
			accountCurrency: "USD",
			resolveExternalRate,
		});

		expect(resolveExternalRate).not.toHaveBeenCalled();
		expect(Number(result?.snapshot.entryConversionRate)).toBeCloseTo(1 / 160);
	});

	it("re-resolves both legs when the portfolio currency changes", async () => {
		const resolveExternalRate = vi.fn(async ({ at }) => ({
			fromCurrency: "JPY",
			toCurrency: "THB",
			rate: at.getUTCHours() === 8 ? 0.23 : 0.24,
			provider: "twelve_data" as const,
			asOf: at,
			precision: "INTRADAY" as const,
		}));

		await prepareTradeUpdate({
			existing: { ...closedTrade, ...existingCalculation, importHash: null },
			patch: { portfolioId: 2 },
			accountCurrency: "THB",
			resolveExternalRate,
		});

		expect(resolveExternalRate).toHaveBeenCalledTimes(2);
	});

	it("never recalculates a broker-imported trade", async () => {
		const resolveExternalRate = vi.fn();

		const result = await prepareTradeUpdate({
			existing: {
				...closedTrade,
				...existingCalculation,
				importHash: "broker-hash",
			},
			patch: { quantity: "2" },
			accountCurrency: "USD",
			resolveExternalRate,
		});

		expect(result).toBeNull();
		expect(resolveExternalRate).not.toHaveBeenCalled();
	});
});
