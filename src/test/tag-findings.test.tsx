// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TagFindings } from "@/components/dashboard/tag-findings";
import { INSIGHT_FOOTER } from "@/lib/insights";

vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => (
		<a href="/journal">{children}</a>
	),
}));

const scope = { count: 60, avgPnl: 10 };

describe("TagFindings", () => {
	it("shows the difference, the linked cohorts and the footer", () => {
		render(
			<TagFindings
				scope={scope}
				tags={[
					{
						key: "1",
						name: "FOMO",
						count: 24,
						avgPnl: -8.5,
						difference: -18.5,
					},
					{ key: "2", name: "Late", count: 12, avgPnl: 4, difference: null },
				]}
			/>,
		);

		expect(screen.getByRole("link", { name: "60 closed trades" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "24 trades" })).toBeTruthy();
		expect(screen.getByText("-$18.50 per trade")).toBeTruthy();
		expect(screen.getByText("Not enough trades (12 of 20)")).toBeTruthy();
		expect(screen.getByText(INSIGHT_FOOTER)).toBeTruthy();
	});

	it("renders nothing with no tag groups", () => {
		const { container } = render(<TagFindings scope={scope} tags={[]} />);
		expect(container.innerHTML).toBe("");
	});
});
