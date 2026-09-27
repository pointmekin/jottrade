// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	RiskMetrics,
	type RiskMetricsData,
} from "@/components/dashboard/RiskMetrics";

const insufficient: RiskMetricsData = {
	sharpe: { value: null, days: 4 },
	maxDrawdown: { dollars: 0, percent: 0 },
	payoff: { ratio: null, avgWin: 150, avgLoss: null, wins: 3, losses: 0 },
	avgHoldTimeHours: null,
	closedTrades: 0,
};

describe("RiskMetrics", () => {
	it("marks unavailable statistics as unavailable, not zero, with the reason", () => {
		render(<RiskMetrics metrics={insufficient} currency="USD" />);

		expect(screen.getAllByText("—")).toHaveLength(3);
		expect(screen.queryByText("0.00")).toBeNull();
		expect(screen.getByText("Needs 20 trading days · 4 so far")).toBeTruthy();
		expect(screen.getByText("Needs a win and a loss · 3W / 0L")).toBeTruthy();
		expect(screen.getByText("No closed trades")).toBeTruthy();
	});

	it("names the average win over average loss a payoff ratio, not risk to reward", () => {
		render(
			<RiskMetrics
				metrics={{
					...insufficient,
					payoff: { ratio: 1.5, avgWin: 150, avgLoss: 100, wins: 2, losses: 1 },
				}}
				currency="USD"
			/>,
		);

		expect(screen.getByText("Payoff ratio")).toBeTruthy();
		expect(screen.getByText("Avg win $150 ÷ avg loss $100")).toBeTruthy();
		expect(screen.queryByText(/risk\/reward/i)).toBeNull();
	});

	it("shows the sample size behind a Sharpe ratio", () => {
		render(
			<RiskMetrics
				metrics={{
					...insufficient,
					sharpe: { value: 1.234, days: 42 },
					maxDrawdown: { dollars: 300, percent: 2.5 },
				}}
				currency="USD"
			/>,
		);

		expect(screen.getByText("1.23")).toBeTruthy();
		expect(screen.getByText("42 trading days · annualized")).toBeTruthy();
		expect(screen.getByText("2.5% from peak")).toBeTruthy();
	});
});
