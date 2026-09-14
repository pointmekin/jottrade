import { describe, expect, it } from "vitest";
import { calculatePnL, shouldRecalculatePnl } from "../lib/finance";

describe("calculatePnL", () => {
	it("uses the gold CFD contract size for XAUUSD broker suffixes", () => {
		expect(
			calculatePnL("SHORT", 4348.229, 4322.605, 0.01, 0, "XAUUSDm"),
		).toEqual({ netPnl: "25.62", returnPercent: "0.59" });
	});

	it("keeps share quantities on a one-unit contract size", () => {
		expect(calculatePnL("LONG", 150, 155, 10, 2, "AAPL")).toEqual({
			netPnl: "48.00",
			returnPercent: "3.20",
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
