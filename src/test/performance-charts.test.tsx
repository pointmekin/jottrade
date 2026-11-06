// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
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

function openTab(name: string) {
	fireEvent.mouseDown(screen.getByRole("tab", { name }));
}

describe("PerformanceCharts insight coverage", () => {
	it("shows one chart at a time, starting with strategy", () => {
		renderCharts({ tagged: 12, planChecked: 1, ruleChecked: 0 });
		expect(screen.getByText("Avg P&L by strategy")).toBeTruthy();
		expect(screen.queryByText("Avg P&L by symbol (top 10)")).toBeNull();
		openTab("Symbol");
		expect(screen.getByText("Avg P&L by symbol (top 10)")).toBeTruthy();
		expect(screen.queryByText("Avg P&L by strategy")).toBeNull();
	});

	it("shows the annotated share and the fixed footer on each insight chart", () => {
		renderCharts({ tagged: 12, planChecked: 1, ruleChecked: 0 });
		const coverage = [
			["Tag", "12 of 40 closed trades have a tag"],
			["Plan", "1 of 40 closed trades have a plan check"],
			["Rule check", "0 of 40 closed trades have a rule check"],
		] as const;
		for (const [tab, text] of coverage) {
			openTab(tab);
			expect(screen.getByText(text)).toBeTruthy();
			expect(screen.getAllByText(INSIGHT_FOOTER)).toHaveLength(1);
		}
		expect(screen.queryByText(/p-value|confidence/i)).toBeNull();
	});

	it("shows the not enough trades state when no closed trade is annotated", () => {
		renderCharts({ tagged: 0, planChecked: 1, ruleChecked: 0 });
		openTab("Tag");
		expect(screen.getByText("Not enough trades")).toBeTruthy();
		openTab("Plan");
		expect(screen.queryByText("Not enough trades")).toBeNull();
		openTab("Rule check");
		expect(
			screen.getByText(
				"None of the closed trades in scope have a rule check yet.",
			),
		).toBeTruthy();
	});

	it("hides the tag chart under a tag filter", () => {
		renderCharts({ tagged: null, planChecked: 1, ruleChecked: 1 });
		expect(screen.queryByRole("tab", { name: "Tag" })).toBeNull();
		expect(screen.queryByText("Avg P&L by tag (top 10)")).toBeNull();
	});
});
