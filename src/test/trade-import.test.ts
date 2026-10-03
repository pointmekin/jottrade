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
	it("nets signed commission and swap into broker P&L", () => {
		expect(parseTradeRows([row()], FIELDS)).toMatchObject({
			skipped: 0,
			trades: [
				{
					ticket: "101",
					netPnl: "49",
					fees: "1",
					entryDate: "2026-09-01T08:00:00.000Z",
					exitPrice: "1.105",
				},
			],
		});
	});
	it("preserves positive swap as a net credit", () => {
		expect(parseTradeRows([row({ swap: "2.00" })], FIELDS)).toMatchObject({
			trades: [{ netPnl: "51.3", commission: "-0.7", swap: "2", fees: "-1.3" }],
		});
	});
	it("names missing required columns", () => {
		expect(
			parseTradeRows(
				[row()],
				FIELDS.filter((field) => field !== "profit"),
			),
		).toEqual({
			error: "CSV is missing required columns: profit or profit_usd.",
		});
	});
	it("reports record and column errors instead of silent skipping", () => {
		expect(parseTradeRows([row(), row({ lots: "" })], FIELDS)).toMatchObject({
			skipped: 1,
			rows: [{ issues: [] }, { rowNumber: 3, issues: [{ column: "lots" }] }],
		});
	});
	it.each(["profit", "commission", "swap"])(
		"rejects nonblank malformed %s",
		(column) => {
			expect(parseTradeRows([row({ [column]: "bad" })], FIELDS)).toMatchObject({
				trades: [],
				rows: [{ issues: [{ column }] }],
			});
		},
	);
	it("permits a valid all-breakeven source", () => {
		expect(parseTradeRows([row({ profit: "1.00" })], FIELDS)).toMatchObject({
			trades: [{ netPnl: "0" }],
			skipped: 0,
		});
	});
	it("distinguishes blank profit from zero; blank costs use zero", () => {
		expect(
			parseTradeRows([row({ profit: "", commission: "", swap: "" })], FIELDS),
		).toMatchObject({ trades: [], rows: [{ issues: [{ column: "profit" }] }] });
		expect(
			parseTradeRows([row({ profit: "0", commission: "", swap: "" })], FIELDS),
		).toMatchObject({ trades: [{ netPnl: "0" }] });
	});
	it("rejects malformed supplied exit time and incomplete close pairs", () => {
		expect(
			parseTradeRows([row({ closing_time_utc: "bad" })], FIELDS),
		).toMatchObject({
			trades: [],
			rows: [{ issues: [{ column: "closing_time_utc" }] }],
		});
	});
	it("preserves open rows without realizing missing broker money", () => {
		expect(
			parseTradeRows(
				[row({ closing_time_utc: "", closing_price: "", profit: "" })],
				FIELDS,
			),
		).toMatchObject({
			trades: [{ netPnl: undefined, exitDate: undefined }],
			skipped: 0,
		});
	});
	it("resolves actual normalized header names", () => {
		const source = Object.fromEntries(
			Object.entries(row()).map(([key, value]) => [
				` ${key.toUpperCase()} `,
				value,
			]),
		);
		expect(parseTradeRows([source], Object.keys(source))).toMatchObject({
			skipped: 0,
			trades: [{ netPnl: "49" }],
		});
	});
	it.each<Record<string, string>>([
		{ lots: "-1" },
		{ type: "withdrawal" },
		{ opening_price: "0" },
		{ closing_time_utc: "2026-08-01 10:00:00" },
	])("rejects unsupported economic facts %s", (override) => {
		expect(parseTradeRows([row(override)], FIELDS)).toMatchObject({
			trades: [],
		});
	});
});
