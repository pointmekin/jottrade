import { describe, expect, it } from "vitest";
import {
	normalizeInstrumentSymbol,
	resolveInstrumentSpec,
} from "../lib/instruments";

const supportedPairs = [
	"EURUSD",
	"GBPUSD",
	"USDJPY",
	"USDCHF",
	"USDCAD",
	"AUDUSD",
	"NZDUSD",
	"EURGBP",
	"EURJPY",
	"EURCHF",
	"EURCAD",
	"EURAUD",
	"EURNZD",
	"EURSGD",
	"EURSEK",
	"EURNOK",
	"EURDKK",
	"EURPLN",
	"EURTRY",
	"GBPJPY",
	"GBPCHF",
	"GBPCAD",
	"GBPAUD",
	"GBPNZD",
	"GBPSGD",
	"AUDJPY",
	"AUDCHF",
	"AUDCAD",
	"AUDNZD",
	"AUDSGD",
	"NZDJPY",
	"NZDCHF",
	"NZDCAD",
	"CADJPY",
	"CADCHF",
	"CHFJPY",
	"USDSEK",
	"USDNOK",
	"USDDKK",
	"USDSGD",
	"USDHKD",
	"USDTHB",
	"USDCNH",
	"USDMXN",
	"USDZAR",
	"USDPLN",
	"USDTRY",
	"SGDJPY",
];

describe("resolveInstrumentSpec", () => {
	it("resolves every supported forex pair as a standard lot contract", () => {
		for (const symbol of supportedPairs) {
			const spec = resolveInstrumentSpec(symbol);
			expect(spec.kind, symbol).toBe("FOREX");
			expect(spec.quantityUnit, symbol).toBe("LOTS");
			expect(spec.contractSize, symbol).toBe(100_000);
			expect(spec.baseCurrency, symbol).toBe(symbol.slice(0, 3));
			expect(spec.quoteCurrency, symbol).toBe(symbol.slice(3, 6));
			expect(spec.pipSize, symbol).toBe(symbol.endsWith("JPY") ? 0.01 : 0.0001);
		}
	});

	it.each(["eurusd", "EUR/USD", "EUR-USD", "EUR_USD", "EURUSDm"])(
		"normalizes the broker symbol %s for lookup",
		(symbol) => {
			expect(resolveInstrumentSpec(symbol).symbol).toBe("EURUSD");
		},
	);

	it("resolves JPY broker suffixes with the JPY pip size", () => {
		expect(resolveInstrumentSpec("USDJPYm")).toMatchObject({
			symbol: "USDJPY",
			kind: "FOREX",
			pipSize: 0.01,
		});
	});

	it("preserves the XAUUSD contract behavior for broker suffixes", () => {
		expect(resolveInstrumentSpec("XAUUSDm")).toEqual({
			symbol: "XAUUSD",
			kind: "METAL",
			quantityUnit: "LOTS",
			contractSize: 100,
			baseCurrency: "XAU",
			quoteCurrency: "USD",
			pipSize: null,
		});
	});

	it("falls back to unit-based behavior for unknown instruments", () => {
		expect(resolveInstrumentSpec("AAPL")).toEqual({
			symbol: "AAPL",
			kind: "UNIT",
			quantityUnit: "UNITS",
			contractSize: 1,
			baseCurrency: null,
			quoteCurrency: null,
			pipSize: null,
		});
	});

	it("does not classify arbitrary six-letter symbols as forex", () => {
		expect(resolveInstrumentSpec("ABCDEF").kind).toBe("UNIT");
	});
});

describe("normalizeInstrumentSymbol", () => {
	it("normalizes casing and separators", () => {
		expect(normalizeInstrumentSymbol("eur/usd")).toBe("EURUSD");
	});
});
