import { describe, expect, it } from "vitest";
import {
	getQuantityDisplay,
	getTradeConversionDisplay,
} from "@/lib/trade-display";

describe("trade display metadata", () => {
	it("describes standard forex lots without rounding the entered quantity", () => {
		expect(
			getQuantityDisplay({
				quantity: "3.525",
				quantityUnit: "LOTS",
				contractSize: "100000",
			}),
		).toEqual({ quantity: "3.525 lots", positionUnits: "352,500" });
	});

	it("describes unit quantities", () => {
		expect(
			getQuantityDisplay({
				quantity: "20",
				quantityUnit: "UNITS",
				contractSize: "1",
			}),
		).toEqual({ quantity: "20 units", positionUnits: "20" });
	});

	it("does not infer missing metadata for legacy trades", () => {
		expect(
			getQuantityDisplay({
				quantity: "3.525",
				quantityUnit: null,
				contractSize: null,
			}),
		).toEqual({ quantity: "3.525", positionUnits: null });
		expect(
			getTradeConversionDisplay({
				quoteCurrency: null,
				pnlCurrency: null,
				exitConversionRate: null,
				exitConversionSource: null,
			}),
		).toBeNull();
	});

	it("labels converted P&L and Frankfurter's precision", () => {
		expect(
			getTradeConversionDisplay({
				quoteCurrency: "JPY",
				pnlCurrency: "USD",
				exitConversionRate: "0.006465",
				exitConversionSource: "FRANKFURTER",
			}),
		).toEqual({
			pnlCurrency: "JPY",
			accountCurrency: "USD",
			pair: "JPY → USD",
			rate: "0.006465",
			source: "Frankfurter daily reference rate",
		});
	});

	it("identifies broker-reported P&L without inventing a rate", () => {
		expect(
			getTradeConversionDisplay({
				quoteCurrency: "JPY",
				pnlCurrency: "USD",
				exitConversionRate: null,
				exitConversionSource: "BROKER_REPORTED",
			}),
		).toEqual({ source: "Broker reported" });
	});

	it("identifies broker-reported P&L from either stored leg", () => {
		expect(
			getTradeConversionDisplay({
				quoteCurrency: "JPY",
				pnlCurrency: "USD",
				entryConversionSource: "BROKER_REPORTED",
				exitConversionRate: null,
				exitConversionSource: null,
			}),
		).toEqual({ source: "Broker reported" });
	});
});
