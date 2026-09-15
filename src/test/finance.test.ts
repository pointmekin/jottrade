import { describe, expect, it } from "vitest";
import { calculatePnL, shouldRecalculatePnl } from "../lib/finance";
import { resolveQuoteToAccountConversion } from "../lib/fx";

describe("calculatePnL", () => {
	it("calculates the required USDJPY lot example in account currency", () => {
		const entryPrice = 153.588;
		const exitPrice = 154.677;

		expect(
			calculatePnL({
				side: "LONG",
				entryPrice,
				exitPrice,
				quantity: 3.525,
				contractSize: 100_000,
				entryQuoteToAccountRate: 1 / entryPrice,
				exitQuoteToAccountRate: 1 / exitPrice,
			}),
		).toEqual({ netPnl: "2481.77", returnPercent: "0.70" });
	});

	it("uses explicit metal contract metadata", () => {
		expect(
			calculatePnL({
				side: "SHORT",
				entryPrice: 4348.229,
				exitPrice: 4322.605,
				quantity: 0.01,
				contractSize: 100,
				entryQuoteToAccountRate: 1,
				exitQuoteToAccountRate: 1,
			}),
		).toEqual({ netPnl: "25.62", returnPercent: "0.59" });
	});

	it("keeps share quantities on a one-unit contract size", () => {
		expect(
			calculatePnL({
				side: "LONG",
				entryPrice: 150,
				exitPrice: 155,
				quantity: 10,
				contractSize: 1,
				entryQuoteToAccountRate: 1,
				exitQuoteToAccountRate: 1,
				feesAccount: 2,
			}),
		).toEqual({ netPnl: "48.00", returnPercent: "3.20" });
	});
});

describe("resolveQuoteToAccountConversion", () => {
	it("uses identity when quote and account currencies match", () => {
		expect(
			resolveQuoteToAccountConversion({
				baseCurrency: "EUR",
				quoteCurrency: "USD",
				accountCurrency: "USD",
				instrumentPrice: 1.18,
			}),
		).toEqual({ type: "IDENTITY", rate: 1 });
	});

	it("uses the inverse instrument price when base and account currencies match", () => {
		expect(
			resolveQuoteToAccountConversion({
				baseCurrency: "USD",
				quoteCurrency: "JPY",
				accountCurrency: "USD",
				instrumentPrice: 154.677,
			}),
		).toEqual({ type: "INSTRUMENT_PRICE", rate: 1 / 154.677 });
	});

	it("identifies third-currency conversions without fetching a rate", () => {
		expect(
			resolveQuoteToAccountConversion({
				baseCurrency: "EUR",
				quoteCurrency: "JPY",
				accountCurrency: "USD",
				instrumentPrice: 169.4,
			}),
		).toEqual({
			type: "EXTERNAL_REQUIRED",
			fromCurrency: "JPY",
			toCurrency: "USD",
		});
	});
});

describe("shouldRecalculatePnl", () => {
	it("recalculates manual trades", () => {
		expect(shouldRecalculatePnl(null)).toBe(true);
	});

	it("keeps broker-reported P&L for imported trades", () => {
		expect(shouldRecalculatePnl("import-hash")).toBe(false);
	});
});
