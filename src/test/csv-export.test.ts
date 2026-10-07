import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import {
	exportFileName,
	guardFormula,
	slugify,
	TRADE_CSV_COLUMNS,
	tradesToCsv,
} from "@/lib/csv-export";
import { TradeSide, TradeStatus } from "@/lib/trade";

const context = {
	accountName: 'Main, "live"',
	accountCurrency: "USD",
	strategyNames: new Map([[3, "Breakout"]]),
};
const trade = (overrides = {}) => ({
	id: 1,
	symbol: "EURUSD",
	side: TradeSide.Long,
	status: TradeStatus.Closed,
	entryDate: new Date("2026-10-01T10:00:00Z"),
	exitDate: new Date("2026-10-01T12:30:00Z"),
	entryPrice: "1.10000",
	exitPrice: "1.10500",
	quantity: "0.20",
	netPnl: "-12.3400",
	returnPercent: null,
	setupId: 3,
	notes: 'line one\nline two, with "quotes" and ไทย 日本',
	screenshots: ["https://x/1.png"],
	...overrides,
});
const parse = (csv: string) =>
	Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
		header: true,
		skipEmptyLines: true,
	}).data;

describe("tradesToCsv", () => {
	it("starts with a UTF-8 BOM and uses CRLF rows", () => {
		const csv = tradesToCsv([trade()], context);
		expect(csv.startsWith("﻿")).toBe(true);
		expect(csv.split("\r\n")).toHaveLength(2);
	});

	it("keeps the column order stable", () => {
		const [header] = tradesToCsv([], context).replace("﻿", "").split("\r\n");
		expect(header.split(",")).toEqual(TRADE_CSV_COLUMNS.map((c) => c.header));
		expect(header.startsWith("trade_id,account,account_currency,symbol")).toBe(
			true,
		);
	});

	it("round-trips quotes, commas, newlines and Unicode", () => {
		const [row] = parse(tradesToCsv([trade()], context));
		expect(row.account).toBe('Main, "live"');
		expect(row.notes).toBe('line one\nline two, with "quotes" and ไทย 日本');
	});

	it("writes decimals as the stored strings without rounding", () => {
		const [row] = parse(
			tradesToCsv([trade({ netPnl: "-12.3400", quantity: "0.20" })], context),
		);
		expect(row.net_pnl).toBe("-12.3400");
		expect(row.quantity).toBe("0.20");
		expect(row.entry_price).toBe("1.10000");
	});

	it("writes ISO UTC dates and empty cells for missing values", () => {
		const [row] = parse(tradesToCsv([trade({ exitDate: null })], context));
		expect(row.entry_time_utc).toBe("2026-10-01T10:00:00.000Z");
		expect(row.exit_time_utc).toBe("");
		expect(row.return_percent).toBe("");
	});

	it("guards text cells that start with a formula character", () => {
		const [row] = parse(
			tradesToCsv(
				[trade({ notes: '=HYPERLINK("http://x")', symbol: "@SUM(A1)" })],
				context,
			),
		);
		expect(row.notes).toBe('\'=HYPERLINK("http://x")');
		expect(row.symbol).toBe("'@SUM(A1)");
	});

	it("does not alter negative numeric cells", () => {
		const [row] = parse(tradesToCsv([trade()], context));
		expect(row.net_pnl).toBe("-12.3400");
	});

	it("marks a trade whose strategy was deleted", () => {
		const [row] = parse(tradesToCsv([trade({ setupId: 99 })], context));
		expect(row.strategy).toBe("#99 (deleted)");
	});

	it("resolves the strategy name and counts screenshots", () => {
		const [row] = parse(tradesToCsv([trade()], context));
		expect(row.strategy).toBe("Breakout");
		expect(row.screenshot_count).toBe("1");
	});
});

describe("guardFormula", () => {
	it.each(["=1+1", "+1", "-1", "@a", "\tx", "\rx"])("guards %j", (value) => {
		expect(guardFormula(value)).toBe(`'${value}`);
	});
	it("leaves safe text alone", () => {
		expect(guardFormula("EURUSD - long")).toBe("EURUSD - long");
	});
});

describe("file names", () => {
	it("slugifies the account name", () => {
		expect(slugify("  Main / Live #2 ")).toBe("main-live-2");
		expect(slugify("日本")).toBe("account");
	});
	it("puts the account and the UTC date in the name", () => {
		const at = new Date("2026-10-08T23:59:00Z");
		expect(exportFileName("trades", "Main Live", at, "csv")).toBe(
			"jottrade-trades-main-live-2026-10-08.csv",
		);
		expect(exportFileName("archive", null, at, "json")).toBe(
			"jottrade-archive-2026-10-08.json",
		);
	});
});
