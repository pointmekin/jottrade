// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TradeReturns } from "@/components/journal/trade-returns";
import { TradeStatus } from "@/lib/trade";

vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));

describe("TradeReturns", () => {
	it("shows price return and account return with the balance at entry", () => {
		render(
			<TradeReturns
				trade={{ status: TradeStatus.Closed, returnPercent: "1.25" }}
				accountReturn={{ percent: 2, balanceAtEntry: 10500 }}
			/>,
		);

		expect(screen.getByText("1.25%")).toBeTruthy();
		expect(screen.getByText("2.00%")).toBeTruthy();
		expect(screen.getByText("Of $10,500.00 at entry")).toBeTruthy();
	});

	it("marks account return unavailable, not zero, with the reason", () => {
		const { rerender } = render(
			<TradeReturns
				trade={{ status: TradeStatus.Closed, returnPercent: null }}
				accountReturn={{ percent: null, balanceAtEntry: 0 }}
			/>,
		);
		expect(screen.getAllByText("—")).toHaveLength(2);
		expect(screen.getByText("No positive balance at entry")).toBeTruthy();

		rerender(
			<TradeReturns
				trade={{ status: TradeStatus.Open, returnPercent: null }}
				accountReturn={{ percent: null, balanceAtEntry: 10000 }}
			/>,
		);
		expect(screen.getAllByText("Trade is not closed")).toHaveLength(2);
	});
});
