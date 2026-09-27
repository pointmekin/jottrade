// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { JournalTable } from "@/components/journal/JournalTable";

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
});
