// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { PerformanceCharts } from "@/components/dashboard/PerformanceCharts";
import { summarizeGroup } from "@/lib/group-summary";
import { INSIGHT_FOOTER } from "@/lib/insights";

vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));
vi.mock("@tanstack/react-router", () => ({
	Link: () => null,
	useNavigate: () => vi.fn(),
}));
vi.mock("recharts", () => {
	const Stub = () => null;
	return {
		Bar: Stub,
		BarChart: Stub,
		Cell: Stub,
		Rectangle: Stub,
		ResponsiveContainer: Stub,
		Tooltip: Stub,
		XAxis: Stub,
		YAxis: Stub,
	};
});

type Props = ComponentProps<typeof PerformanceCharts>;

const followed = { key: "followed", name: "Followed", ...summarizeGroup([50]) };

function renderCharts(insightCoverage: Props["insightCoverage"]) {
	render(
		<PerformanceCharts
			closedTrades={40}
			insightCoverage={insightCoverage}
			byStrategy={[]}
			bySymbol={[]}
			byTag={[]}
			byAdherence={[followed]}
			byRuleCheck={[]}
			byDayOfWeek={[]}
			byHour={[]}
		/>,
	);
}

describe("PerformanceCharts insight coverage", () => {
	it("shows the annotated share and the fixed footer on each insight chart", () => {
		renderCharts({ tagged: 12, planChecked: 1, ruleChecked: 0 });

		expect(screen.getByText("12 of 40 closed trades have a tag")).toBeTruthy();
		expect(
			screen.getByText("1 of 40 closed trades have a plan check"),
		).toBeTruthy();
		expect(
			screen.getByText("0 of 40 closed trades have a rule check"),
		).toBeTruthy();
		expect(screen.getAllByText(INSIGHT_FOOTER)).toHaveLength(3);
		expect(screen.queryByText(/p-value|confidence/i)).toBeNull();
	});

	it("shows the not enough trades state when no closed trade is annotated", () => {
		renderCharts({ tagged: 0, planChecked: 1, ruleChecked: 0 });

		expect(screen.getAllByText("Not enough trades")).toHaveLength(2);
		expect(
			screen.getByText(
				"None of the closed trades in scope have a rule check yet.",
			),
		).toBeTruthy();
	});

	it("hides the tag chart under a tag filter", () => {
		renderCharts({ tagged: null, planChecked: 1, ruleChecked: 1 });

		expect(screen.queryByText("Avg P&L by tag (top 10)")).toBeNull();
		expect(screen.getAllByText(INSIGHT_FOOTER)).toHaveLength(2);
	});
});
