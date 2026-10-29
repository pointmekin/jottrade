import { describe, expect, it } from "vitest";
import { formatInstrumentPrice } from "@/lib/instrument-price";

describe("formatInstrumentPrice", () => {
	it.each([
		["EURUSD", "1.09750", "1.09750 USD"],
		["EURUSD", "1.09800", "1.09800 USD"],
		["USDJPY", "149.501", "149.501 JPY"],
		["USDJPY", "149.502", "149.502 JPY"],
		["XAUUSD", "2745.125", "2745.125 USD"],
		["BTCUSD", "0.000000000000123456789", "0.000000000000123456789"],
		["PENNY", "0.0001", "0.0001"],
		["PENNY", "0.00015", "0.00015"],
		["AAPL", "9007199254740993.123456789", "9007199254740993.123456789"],
		["EUR/USDm", "1.09750", "1.09750 USD"],
		["PENNY", "1.5e-7", "0.00000015"],
		["UNKNOWN", "0", "0"],
	])(
		"formats %s %s without rounding or guessing units",
		(symbol, value, expected) => {
			expect(formatInstrumentPrice(value, symbol)).toBe(expected);
		},
	);

	it("formats computed averages without binary float noise or a fixed decimal cutoff", () => {
		expect(formatInstrumentPrice(1.0975000000000001, "EURUSD")).toBe(
			"1.0975 USD",
		);
		expect(formatInstrumentPrice(1.5e-20, "UNKNOWN")).toBe(
			"0.000000000000000000015",
		);
	});

	it.each([null, undefined, "", " ", "NaN", "Infinity", "invalid"])(
		"keeps %s unavailable",
		(value) => expect(formatInstrumentPrice(value, "EURUSD")).toBe("—"),
	);
});
