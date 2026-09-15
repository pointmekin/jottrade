import { describe, expect, it, vi } from "vitest";
import { prepareImportedTradeCalculation } from "@/server/import-calculation";

const closedImport = {
	symbol: "EURJPY",
	side: "LONG" as const,
	entryDate: new Date("2026-09-15T08:32:00.000Z"),
	exitDate: new Date("2026-09-15T09:32:00.000Z"),
	entryPrice: 170,
	exitPrice: 171,
	quantity: 1,
	fees: 0,
	accountCurrency: "USD",
};

describe("import calculation", () => {
	it("preserves broker P&L and records its source without provider calls", () => {
		const provider = vi.fn();

		const result = prepareImportedTradeCalculation({
			...closedImport,
			brokerNetPnl: "345.67",
		});

		expect(result.netPnl).toBe("345.67");
		expect(result.snapshot.entryConversionSource).toBe("BROKER_REPORTED");
		expect(result.snapshot.exitConversionSource).toBe("BROKER_REPORTED");
		expect(result.snapshot.entryConversionRate).toBeNull();
		expect(provider).not.toHaveBeenCalled();
	});

	it.each(["EURUSD", "USDJPY"])(
		"calculates a local-only %s import",
		(symbol) => {
			const result = prepareImportedTradeCalculation({
				...closedImport,
				symbol,
			});

			expect(result.netPnl).toBeDefined();
			expect(result.warning).toBeUndefined();
		},
	);

	it("skips P&L when an external conversion would be required", () => {
		const result = prepareImportedTradeCalculation(closedImport);

		expect(result.netPnl).toBeUndefined();
		expect(result.warning).toBe(
			"P&L could not be calculated automatically because external currency conversion is required.",
		);
	});
});
