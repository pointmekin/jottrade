import { describe, expect, it } from "vitest";
import { parseAdjustmentCsv } from "../lib/adjustment-import";

const headers =
	"Symbol,Type,Lots,Position ID,Ex-date,Adjustment day,Adjustment date,Dividend rate,Adjustment";

describe("Exness adjustment CSV parsing", () => {
	it("preserves the adjustment timestamp and signed amount", () => {
		const csv = [
			headers,
			'"XAU/USD","Buy","0.01","2268622980","12 Sep 2026","14 Sep 2026","14 Sep 2026 21:00:00 UTC","4.50","-4.50 USD"',
		].join("\n");

		const result = parseAdjustmentCsv(csv);

		expect(result.skipped).toBe(0);
		expect(result.adjustments).toEqual([
			expect.objectContaining({
				symbol: "XAU/USD",
				positionId: "2268622980",
				occurredAt: "2026-09-14T21:00:00.000Z",
				amount: -4.5,
			}),
		]);
	});

	it("accepts positive adjustments and thousands separators", () => {
		const csv = [
			headers,
			'"US500","Sell","1","42","","15 Sep 2026","2026-09-15 22:00:00","","+1,234.56"',
		].join("\n");

		expect(parseAdjustmentCsv(csv).adjustments[0]).toEqual(
			expect.objectContaining({
				occurredAt: "2026-09-15T22:00:00.000Z",
				amount: 1234.56,
			}),
		);
	});

	it("rejects a trade-history CSV instead of silently importing it", () => {
		expect(() =>
			parseAdjustmentCsv(
				"ticket,symbol,opening_time_utc,profit\n1,XAUUSD,2026-09-14 10:00:00,5",
			),
		).toThrow(/adjustment date.*adjustment/i);
	});

	it("skips incomplete rows and reports their count", () => {
		const csv = [
			headers,
			'"XAU/USD","Buy","0.01","1","","","not a date","","-4.50"',
			'"XAU/USD","Buy","0.01","2","","","14 Sep 2026 21:00 UTC","","0"',
		].join("\n");

		const result = parseAdjustmentCsv(csv);
		expect(result.adjustments).toEqual([]);
		expect(result.skipped).toBe(2);
	});
});
