// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { StrategyForm } from "@/components/strategies/StrategyForm";

vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({ activeAccount: undefined }),
}));

vi.mock("@/server/strategyActions", () => ({
	createStrategy: vi.fn(),
	updateStrategy: vi.fn(),
	getStrategyPerformance: vi.fn(),
}));

function Wrapper({ children }: { children: ReactNode }) {
	return (
		<QueryClientProvider client={new QueryClient()}>
			{children}
		</QueryClientProvider>
	);
}

const nameInput = () =>
	screen.getByPlaceholderText("e.g. Breakout") as HTMLInputElement;
const descriptionInput = () =>
	screen.getByPlaceholderText("Describe this setup...") as HTMLTextAreaElement;

describe("StrategyForm", () => {
	it("shows the fields of the strategy that replaces the current one", () => {
		const breakout = { id: 1, name: "Breakout", description: "Range break" };
		const reversal = { id: 2, name: "Reversal", description: "Fade the move" };

		const { rerender } = render(
			<Wrapper>
				<StrategyForm strategy={breakout} onSaved={vi.fn()} />
			</Wrapper>,
		);
		expect(nameInput().value).toBe("Breakout");
		fireEvent.change(nameInput(), { target: { value: "Breakout edited" } });

		rerender(
			<Wrapper>
				<StrategyForm strategy={reversal} onSaved={vi.fn()} />
			</Wrapper>,
		);
		expect(nameInput().value).toBe("Reversal");
		expect(descriptionInput().value).toBe("Fade the move");
	});
});
