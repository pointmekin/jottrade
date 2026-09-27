import { describe, expect, it } from "vitest";
import { parseTradeRows } from "@/lib/trade-import";

const FIELDS = [
	"ticket",
	"opening_time_utc",
	"closing_time_utc",
	"type",
	"lots",
	"symbol",
	"opening_price",
	"closing_price",
	"commission",
	"swap",
	"profit",
];

const row = (overrides: Record<string, string> = {}) => ({
	ticket: "101",
	opening_time_utc: "2026-09-01 08:00:00",
	closing_time_utc: "2026-09-01 10:00:00",
	type: "buy",
	lots: "0.10",
	symbol: "EURUSD",
	opening_price: "1.1000",
	closing_price: "1.1050",
	commission: "-0.70",
	swap: "-0.30",
	profit: "50.00",
	...overrides,
});

describe("parseTradeRows", () => {
	it("nets commission and swap into P&L and counts them as fees", () => {
		const result = parseTradeRows([row()], FIELDS);
		expect(result).toMatchObject({
			skipped: 0,
			trades: [
				{
					ticket: "101",
					netPnl: "49.00",
					fees: "1.00",
					entryDate: "2026-09-01T08:00:00.000Z",
					exitPrice: "1.105",
				},
			],
		});
	});

	it("names the missing required columns", () => {
		expect(
			parseTradeRows(
				[row()],
				FIELDS.filter((f) => f !== "profit"),
			),
		).toEqual({
			error: "CSV is missing required columns: profit or profit_usd.",
		});
	});

	it("skips incomplete rows and reports how many", () => {
		const result = parseTradeRows([row(), row({ lots: "" })], FIELDS);
		expect(result).toMatchObject({ skipped: 1 });
	});

	it("rejects an export where every row has zero P&L", () => {
		const result = parseTradeRows(
			[row({ profit: "", commission: "", swap: "" })],
			FIELDS,
		);
		expect(result).toHaveProperty("error");
	});
});
