// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InsightsList } from "@/components/dashboard/insights-list";
import { findInsights, INSIGHT_FOOTER } from "@/lib/insights";
import { TagColor } from "@/lib/trade-tag";

vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: string }) => (
		<a href="/journal">{children}</a>
	),
}));

const trade = (id: number, netPnl: number, entry: string) => ({
	id,
	netPnl,
	entryDate: new Date(`2026-03-02T${entry}:00Z`),
});

const FOMO = { id: 7, name: "FOMO", color: TagColor.Pink };
const CONTEXT = { portfolioId: 1, period: { from: null, to: null } };

describe("InsightsList", () => {
	it("shows the difference per trade, links both cohorts and shows the footer", () => {
		const asia = Array.from({ length: 20 }, (_, i) => trade(i, -20, "03:00"));
		const london = Array.from({ length: 5 }, (_, i) =>
			trade(i + 20, 80, "09:00"),
		);
		const tags = new Map([[1, [FOMO]]]);

		render(
			<InsightsList
				insights={findInsights([...asia, ...london], tags, CONTEXT)}
			/>,
		);

		expect(screen.getByText("Tag: FOMO")).toBeTruthy();
		expect(screen.getByText("Session: Asia (00:00–08:00 UTC)")).toBeTruthy();
		expect(screen.getByText("-$20.00 per trade")).toBeTruthy();
		expect(screen.getByText("Open 20 trades")).toBeTruthy();
		expect(screen.getAllByText("Open 25 trades in scope")).toHaveLength(3);
		expect(screen.getAllByText("Not enough trades (1 of 20)")).toHaveLength(1);
		expect(screen.getByText("Not enough trades (5 of 20)")).toBeTruthy();
		expect(screen.getByText(INSIGHT_FOOTER)).toBeTruthy();
		expect(screen.queryByText(/p-value|confidence|cost|saved/i)).toBeNull();
	});

	it("shows nothing with no closed trades in scope", () => {
		const { container } = render(<InsightsList insights={[]} />);
		expect(container.innerHTML).toBe("");
	});
});
