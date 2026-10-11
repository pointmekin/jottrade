// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionFindings } from "@/components/dashboard/session-findings";
import { INSIGHT_FOOTER, SESSION_WINDOWS } from "@/lib/insights";

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

const [asia, london, newYork, other] = SESSION_WINDOWS;
const sessions = [
	{ ...asia, tradeIds: ids(1, 24), count: 24, avgPnl: -8.5, difference: -18.5 },
	{ ...london, tradeIds: ids(100, 3), count: 3, avgPnl: 40, difference: null },
	{ ...newYork, tradeIds: ids(200, 33), count: 33, avgPnl: 25, difference: 15 },
	{ ...other, tradeIds: [], count: 0, avgPnl: 0, difference: null },
];

describe("SessionFindings", () => {
	it("shows the windows, the differences, the trade links and the footer", () => {
		render(
			<SessionFindings scope={{ count: 60, avgPnl: 10 }} sessions={sessions} />,
		);

		expect(screen.getByRole("link", { name: "60 closed trades" })).toBeTruthy();
		expect(screen.getByText(/00:00–08:00 UTC · 24 trades/)).toBeTruthy();
		expect(screen.getByText(/21:00–24:00 UTC · 0 trades/)).toBeTruthy();
		expect(screen.getByText("-$18.50 per trade")).toBeTruthy();
		expect(screen.getByText("+$15.00 per trade")).toBeTruthy();
		expect(screen.getByText("Not enough trades (3 of 20)")).toBeTruthy();
		expect(screen.getByText("Not enough trades (0 of 20)")).toBeTruthy();
		expect(screen.getByRole("link", { name: "#100" })).toBeTruthy();
		expect(screen.queryByText(/in Other/)).toBeNull();
		expect(
			screen.getAllByRole("button").map((button) => button.textContent),
		).toEqual([
			"Asia session: -$18.50 per trade against the scope avg (24 trades).",
			"New York session: +$15.00 per trade against the scope avg (33 trades).",
		]);
		expect(screen.getByText(INSIGHT_FOOTER)).toBeTruthy();
	});

	it("renders nothing with no closed trades", () => {
		const { container } = render(
			<SessionFindings scope={{ count: 0, avgPnl: 0 }} sessions={sessions} />,
		);
		expect(container.innerHTML).toBe("");
	});
});
