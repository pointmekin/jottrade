// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrategyPerformance } from "@/components/strategies/StrategyPerformance";
import { summarizeAdherence } from "@/lib/group-summary";
import { PlanAdherence } from "@/lib/playbook-check";
import { getStrategyPerformance } from "@/server/strategyActions";

vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({
		activeAccount: { id: 7, name: "Exness Pro", currency: "EUR" },
	}),
}));

vi.mock("@/server/strategyActions", () => ({
	getStrategyPerformance: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		search,
		children,
	}: {
		to: string;
		search: Record<string, string>;
		children: ReactNode;
	}) => <a href={`${to}?${new URLSearchParams(search)}`}>{children}</a>,
}));

const mockPerformance = vi.mocked(getStrategyPerformance);

const unchecked = (pnls: number[]) =>
	summarizeAdherence(
		pnls.map((netPnl) => ({ netPnl, adherence: PlanAdherence.Unchecked })),
	);

function renderWith(performance: ReturnType<typeof summarizeAdherence>) {
	mockPerformance.mockResolvedValue(performance);
	render(
		<QueryClientProvider client={new QueryClient()}>
			<StrategyPerformance strategyId={3} />
		</QueryClientProvider>,
	);
}

describe("StrategyPerformance", () => {
	beforeEach(() => mockPerformance.mockReset());

	it("asks the server for the whole account history of the strategy", async () => {
		renderWith(unchecked(Array(60).fill(10)));

		expect(await screen.findByText("60")).toBeTruthy();
		expect(mockPerformance).toHaveBeenCalledWith({
			data: { portfolioId: 7, strategyId: 3 },
		});
	});

	it("states the scope and formats money in the account currency", async () => {
		renderWith(unchecked([120, -20, 0]));

		expect(await screen.findAllByText("+€100.00")).toHaveLength(2);
		expect(screen.getByText("All time · Exness Pro · EUR")).toBeTruthy();
		expect(screen.getByText("1W / 1L / 1 scratch")).toBeTruthy();
		expect(screen.getAllByText("50.0%")).toHaveLength(2);
	});

	it("shows an unavailable win rate, not zero, when every trade is breakeven", async () => {
		renderWith(unchecked([0, 0]));

		expect((await screen.findAllByText("—")).length).toBeGreaterThan(0);
		expect(screen.getByText("No win or loss yet")).toBeTruthy();
	});

	it("shows an explicit empty state without closed trades", async () => {
		renderWith(unchecked([]));

		expect(
			await screen.findByText(
				"No closed trades use this strategy in this account yet.",
			),
		).toBeTruthy();
	});

	it("compares what you marked, with the sample size and a link to the same trades", async () => {
		const rows = [
			{ netPnl: 30, adherence: PlanAdherence.Followed },
			{ netPnl: -10, adherence: PlanAdherence.Followed },
			{ netPnl: 5, adherence: PlanAdherence.Unchecked },
		];
		renderWith(summarizeAdherence(rows));

		const table = await screen.findByRole("region", { name: "Plan adherence" });
		expect(within(table).getByText(/You marked/)).toBeTruthy();
		const followed = within(table).getByRole("listitem", {
			name: "Followed",
		});
		expect(within(followed).getByText("n = 2")).toBeTruthy();
		expect(within(followed).getByText("+€20.00")).toBeTruthy();
		expect(
			within(followed)
				.getByRole("link", { name: "Open 2 trades" })
				.getAttribute("href"),
		).toBe("/journal?setupId=3&adherence=followed&status=CLOSED");
		const broken = within(table).getByRole("listitem", { name: "Broke" });
		expect(within(broken).getByText("No trades")).toBeTruthy();
		expect(within(broken).queryByRole("link")).toBeNull();
		expect(
			within(table).getByRole("link", { name: "Open 1 trade" }),
		).toBeTruthy();
	});

	it("asks for a check in review when no trade is checked", async () => {
		renderWith(unchecked([5]));

		expect(
			await screen.findByText(
				"Check trades in review to compare followed and broken trades.",
			),
		).toBeTruthy();
	});
});
