// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SizingFinding } from "@/components/dashboard/sizing-finding";
import { INSIGHT_FOOTER } from "@/lib/insights";

vi.mock("@/components/dashboard/add-to-review-button", () => ({
	AddToReviewButton: ({ text }: { text: string }) => (
		<button type="button">{text}</button>
	),
}));
vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => (
		<a href="/journal">{children}</a>
	),
}));

const ids = (from: number, count: number) =>
	Array.from({ length: count }, (_, i) => from + i);

describe("SizingFinding", () => {
	it("shows the change, both cohorts, the trade links and the footer", () => {
		render(
			<SizingFinding
				sizing={{
					afterLoss: { tradeIds: ids(1, 22), withRisk: 20, medianRisk: 150 },
					other: { tradeIds: ids(100, 30), withRisk: 25, medianRisk: 100 },
					change: 50,
				}}
			/>,
		);

		expect(screen.getByRole("link", { name: "52 closed trades" })).toBeTruthy();
		expect(screen.getByText(/20 of 22 trades with initial risk/)).toBeTruthy();
		expect(screen.getByText(/median \$100\.00/)).toBeTruthy();
		expect(screen.getByText("+50% median risk after a loss")).toBeTruthy();
		expect(screen.getByRole("link", { name: "#1" })).toBeTruthy();
		expect(screen.getByRole("button").textContent).toBe(
			"Sizing after a loss: +50% median initial risk (20 trades after a loss).",
		);
		expect(screen.getByText(INSIGHT_FOOTER)).toBeTruthy();
	});

	it("shows the limitation when risk is missing", () => {
		render(
			<SizingFinding
				sizing={{
					afterLoss: { tradeIds: ids(1, 25), withRisk: 4, medianRisk: 90 },
					other: { tradeIds: ids(100, 30), withRisk: 0, medianRisk: null },
					change: null,
				}}
			/>,
		);

		expect(screen.getByText(/no median/)).toBeTruthy();
		expect(
			screen.getByText("Not enough trades with initial risk (0 of 20)"),
		).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("renders nothing with no closed trades", () => {
		const empty = { tradeIds: [], withRisk: 0, medianRisk: null };
		const { container } = render(
			<SizingFinding
				sizing={{ afterLoss: empty, other: empty, change: null }}
			/>,
		);
		expect(container.innerHTML).toBe("");
	});
});
