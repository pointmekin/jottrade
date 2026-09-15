import { describe, expect, it } from "vitest";
import { assertCurrencyChangeAllowed } from "@/server/portfolio-currency";

describe("portfolio currency protection", () => {
	it("allows an unchanged currency", () => {
		expect(() =>
			assertCurrencyChangeAllowed({
				currentCurrency: "USD",
				nextCurrency: "usd",
				tradeCount: 2,
				cashFlowCount: 1,
			}),
		).not.toThrow();
	});

	it.each([
		{ tradeCount: 1, cashFlowCount: 0 },
		{ tradeCount: 0, cashFlowCount: 1 },
	])("rejects a currency change after account activity", (counts) => {
		expect(() =>
			assertCurrencyChangeAllowed({
				currentCurrency: "USD",
				nextCurrency: "THB",
				...counts,
			}),
		).toThrow(
			"Account currency cannot be changed after account activity exists.\nCreate another account if you need a different account currency.",
		);
	});
});
