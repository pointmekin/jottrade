// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TradeReturns } from "@/components/journal/trade-returns";

describe("TradeReturns", () => {
	it("shows price return and account return with the balance at entry", () => {
		render(
			<TradeReturns
				status="CLOSED"
				returnPercent="1.25"
				accountReturn={{ percent: 2, balanceAtEntry: 10500 }}
				currency="USD"
			/>,
		);

		expect(screen.getByText("1.25%")).toBeTruthy();
		expect(screen.getByText("2.00%")).toBeTruthy();
		expect(screen.getByText("Of $10,500.00 at entry")).toBeTruthy();
	});

	it("marks account return unavailable, not zero, with the reason", () => {
		const { rerender } = render(
			<TradeReturns
				status="CLOSED"
				returnPercent={null}
				accountReturn={{ percent: null, balanceAtEntry: 0 }}
				currency="USD"
			/>,
		);
		expect(screen.getAllByText("—")).toHaveLength(2);
		expect(screen.getByText("No positive balance at entry")).toBeTruthy();

		rerender(
			<TradeReturns
				status="OPEN"
				returnPercent={null}
				accountReturn={{ percent: null, balanceAtEntry: 10000 }}
				currency="USD"
			/>,
		);
		expect(screen.getAllByText("Trade is not closed")).toHaveLength(2);
	});
});
