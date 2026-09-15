import { describe, expect, it, vi } from "vitest";
import { calculatePositionSize, sizePosition } from "@/lib/position-sizing";

const baseInput = {
	balance: 10_000,
	riskPercent: 1,
	entryPrice: 1.1025,
	stopPrice: 1.1,
	targetPrice: 1.10825,
	accountCurrency: "USD",
};

describe("position sizing", () => {
	it("uses actual price distance for forex lots and pips only for display", () => {
		const result = calculatePositionSize({
			...baseInput,
			symbol: "EURUSD",
			quoteToAccountRate: 1,
		});

		expect(result.positionSize).toBeCloseTo(0.4);
		expect(result.positionUnits).toBeCloseTo(40_000);
		expect(result.stopDistancePips).toBeCloseTo(25);
		expect(result.rrRatio).toBeCloseTo(2.3);
		expect(result.quantityUnit).toBe("LOTS");
	});

	it("keeps unit-based instruments in units", () => {
		const result = calculatePositionSize({
			...baseInput,
			symbol: "AAPL",
			entryPrice: 150,
			stopPrice: 145,
			targetPrice: 160,
			quoteToAccountRate: 1,
		});

		expect(result.positionSize).toBe(20);
		expect(result.positionUnits).toBe(20);
		expect(result.stopDistancePips).toBeNull();
		expect(result.quantityUnit).toBe("UNITS");
	});

	it.each(["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "XAUUSD"])(
		"uses identity conversion for %s in a USD account",
		async (symbol) => {
			const resolveExternalRate = vi.fn();

			const result = await sizePosition(
				{ ...baseInput, symbol },
				resolveExternalRate,
			);

			expect(result.conversion).toMatchObject({ type: "IDENTITY", rate: 1 });
			expect(resolveExternalRate).not.toHaveBeenCalled();
		},
	);

	it.each(["USDJPY", "USDCHF", "USDCAD", "USDTHB"])(
		"uses the stop-price inverse for %s in a USD account",
		async (symbol) => {
			const resolveExternalRate = vi.fn();
			const result = await sizePosition(
				{
					...baseInput,
					symbol,
					entryPrice: 155,
					stopPrice: 154,
				},
				resolveExternalRate,
			);

			expect(result.conversion).toMatchObject({
				type: "INSTRUMENT_PRICE",
				rate: 1 / 154,
			});
			expect(resolveExternalRate).not.toHaveBeenCalled();
		},
	);

	it.each([
		["EURJPY", "USD", "JPY", "USD"],
		["GBPJPY", "USD", "JPY", "USD"],
		["AUDJPY", "USD", "JPY", "USD"],
		["EURGBP", "USD", "GBP", "USD"],
		["GBPJPY", "EUR", "JPY", "EUR"],
	])(
		"requests the current quote conversion for %s in a %s account",
		async (symbol, accountCurrency, fromCurrency, toCurrency) => {
			const resolveExternalRate = vi.fn(async () => ({
				fromCurrency,
				toCurrency,
				rate: 0.0065,
				provider: "twelve_data" as const,
				precision: "INTRADAY" as const,
				asOf: "2026-09-16T04:00:00.000Z",
			}));

			const result = await sizePosition(
				{
					...baseInput,
					symbol,
					accountCurrency,
					entryPrice: 155,
					stopPrice: 154,
				},
				resolveExternalRate,
			);

			expect(resolveExternalRate).toHaveBeenCalledOnce();
			expect(resolveExternalRate).toHaveBeenCalledWith({
				fromCurrency,
				toCurrency,
			});
			expect(result.conversion).toMatchObject({
				type: "CURRENT_RATE",
				fromCurrency,
				toCurrency,
			});
		},
	);

	it("uses instrument-price conversion for EURUSD in a EUR account", async () => {
		const resolveExternalRate = vi.fn();
		const result = await sizePosition(
			{ ...baseInput, symbol: "EURUSD", accountCurrency: "EUR" },
			resolveExternalRate,
		);

		expect(result.conversion).toMatchObject({
			type: "INSTRUMENT_PRICE",
			rate: 1 / baseInput.stopPrice,
		});
		expect(resolveExternalRate).not.toHaveBeenCalled();
	});

	it("rejects invalid values before requesting a conversion", async () => {
		const resolveExternalRate = vi.fn();

		await expect(
			sizePosition(
				{ ...baseInput, symbol: "EURJPY", stopPrice: 0 },
				resolveExternalRate,
			),
		).rejects.toThrow("positive");
		expect(resolveExternalRate).not.toHaveBeenCalled();
	});
});
