// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { JournalTable } from "@/components/journal/JournalTable";
import { mergeJournalEntries } from "@/lib/journal-entries";
import { TradeSide, TradeStatus } from "@/lib/trade";

vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

describe("JournalTable", () => {
	it("defines the price return column in the app", async () => {
		render(<JournalTable entries={[]} />);

		fireEvent.click(
			screen.getByRole("button", { name: "How Price return is calculated" }),
		);

		expect(
			await screen.findByText(/Fees, leverage, swaps and currency/),
		).toBeTruthy();
	});

	it("selects trades without opening them and shows their tags", () => {
		const trade = (id: number) => ({
			id,
			symbol: `SYM${id}`,
			side: TradeSide.Long,
			status: TradeStatus.Closed,
			entryDate: new Date("2026-10-01T10:00:00Z"),
			exitDate: null,
			entryPrice: "1",
			exitPrice: null,
			quantity: "1",
			netPnl: null,
			returnPercent: null,
			tags: [{ id: 9, name: "Late entry", color: "amber" as const }],
		});
		const selection = {
			selectedIds: new Set([1]),
			onToggle: vi.fn(),
			onTogglePage: vi.fn(),
		};
		const onTradeClick = vi.fn();
		render(
			<JournalTable
				entries={mergeJournalEntries([trade(1), trade(2)], [])}
				selection={selection}
				onTradeClick={onTradeClick}
			/>,
		);

		fireEvent.click(
			screen.getByRole("checkbox", { name: "Select SYM2 trade" }),
		);
		expect(selection.onToggle).toHaveBeenCalledWith(2);
		expect(onTradeClick).not.toHaveBeenCalled();
		const pageBox = screen.getByRole("checkbox", {
			name: "Select all trades on this page",
		});
		expect(pageBox.getAttribute("data-state")).toBe("indeterminate");
		fireEvent.click(pageBox);
		expect(selection.onTogglePage).toHaveBeenCalledWith([1, 2], true);
		expect(screen.getAllByText("Late entry").length).toBeGreaterThan(0);
	});
});
