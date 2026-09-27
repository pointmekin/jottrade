// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrategyPerformance } from "@/components/strategies/StrategyPerformance";
import { type GroupSummary, summarizeGroup } from "@/lib/group-summary";
import { getStrategyPerformance } from "@/server/strategyActions";

vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({
		activeAccount: { id: 7, name: "Exness Pro", currency: "EUR" },
	}),
}));

vi.mock("@/server/strategyActions", () => ({
	getStrategyPerformance: vi.fn(),
}));

const mockPerformance = vi.mocked(getStrategyPerformance);

function renderWith(summary: GroupSummary) {
	mockPerformance.mockResolvedValue(summary);
	render(
		<QueryClientProvider client={new QueryClient()}>
			<StrategyPerformance strategyId={3} />
		</QueryClientProvider>,
	);
}

describe("StrategyPerformance", () => {
	beforeEach(() => mockPerformance.mockReset());

	it("asks the server for the whole account history of the strategy", async () => {
		renderWith(summarizeGroup(Array(60).fill(10)));

		expect(await screen.findByText("60")).toBeTruthy();
		expect(mockPerformance).toHaveBeenCalledWith({
			data: { portfolioId: 7, strategyId: 3 },
		});
	});

	it("states the scope and formats money in the account currency", async () => {
		renderWith(summarizeGroup([120, -20, 0]));

		expect(await screen.findByText("+€100.00")).toBeTruthy();
		expect(screen.getByText("All time · Exness Pro · EUR")).toBeTruthy();
		expect(screen.getByText("1W / 1L / 1 scratch")).toBeTruthy();
		expect(screen.getByText("50.0%")).toBeTruthy();
	});

	it("shows an unavailable win rate, not zero, when every trade is breakeven", async () => {
		renderWith(summarizeGroup([0, 0]));

		expect(await screen.findByText("—")).toBeTruthy();
		expect(screen.getByText("No win or loss yet")).toBeTruthy();
	});

	it("shows an explicit empty state without closed trades", async () => {
		renderWith(summarizeGroup([]));

		expect(
			await screen.findByText(
				"No closed trades use this strategy in this account yet.",
			),
		).toBeTruthy();
	});
});
