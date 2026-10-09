// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { StrategyForm } from "@/components/strategies/StrategyForm";
import { StrategyList } from "@/components/strategies/StrategyList";
import { PlaybookCriterionKind, type Strategy } from "@/lib/playbook";
import { createStrategy } from "@/server/strategyActions";

vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({ activeAccount: undefined }),
}));

vi.mock("@/server/strategyActions", () => ({
	createStrategy: vi.fn(),
	updateStrategy: vi.fn(),
	getStrategyPerformance: vi.fn(),
}));

beforeAll(() => {
	// Radix Checkbox measures itself; jsdom has no ResizeObserver.
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
});

function Wrapper({ children }: { children: ReactNode }) {
	return (
		<QueryClientProvider client={new QueryClient()}>
			{children}
		</QueryClientProvider>
	);
}

const strategyOf = (fields: Partial<Strategy>): Strategy => ({
	id: 1,
	userId: "u",
	name: "Breakout",
	description: null,
	criteria: [],
	riskGuidance: null,
	criteriaVersion: 1,
	archivedAt: null,
	...fields,
});

const nameInput = () =>
	screen.getByPlaceholderText("e.g. Breakout") as HTMLInputElement;
const descriptionInput = () =>
	screen.getByPlaceholderText("Describe this setup...") as HTMLTextAreaElement;
const entryGroup = () => screen.getByRole("group", { name: "Entry criteria" });

describe("StrategyForm", () => {
	it("shows the fields of the strategy that replaces the current one", () => {
		const breakout = strategyOf({ id: 1, description: "Range break" });
		const reversal = strategyOf({
			id: 2,
			name: "Reversal",
			description: "Fade the move",
		});

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

	it("adds, removes and saves playbook criteria", async () => {
		vi.mocked(createStrategy).mockResolvedValue(strategyOf({}));
		render(
			<Wrapper>
				<StrategyForm strategy={null} onSaved={vi.fn()} />
			</Wrapper>,
		);
		expect(
			screen.getByText("Add the conditions you check before you enter."),
		).toBeTruthy();
		fireEvent.change(nameInput(), { target: { value: "Breakout" } });
		const add = within(entryGroup()).getByRole("button", {
			name: "Add criterion",
		});

		fireEvent.click(add);
		fireEvent.click(add);
		const first = within(entryGroup()).getByLabelText("Entry criterion 1");
		await waitFor(() =>
			expect(document.activeElement).toBe(
				within(entryGroup()).getByLabelText("Entry criterion 2"),
			),
		);
		fireEvent.change(first, { target: { value: "Volume above average" } });
		fireEvent.change(within(entryGroup()).getByLabelText("Entry criterion 2"), {
			target: { value: "Drop me" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Remove criterion: Drop me" }),
		);
		fireEvent.click(screen.getByRole("checkbox"));
		fireEvent.change(screen.getByLabelText("Risk guidance"), {
			target: { value: "Risk 1% or less" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create Strategy" }));

		await waitFor(() => expect(createStrategy).toHaveBeenCalled());
		expect(vi.mocked(createStrategy).mock.calls[0][0]).toEqual({
			data: {
				name: "Breakout",
				description: "",
				riskGuidance: "Risk 1% or less",
				criteria: [
					{
						id: expect.any(String),
						kind: PlaybookCriterionKind.Entry,
						text: "Volume above average",
						required: false,
					},
				],
			},
		});
	});

	it("blocks a save with a blank criterion", async () => {
		render(
			<Wrapper>
				<StrategyForm strategy={strategyOf({})} onSaved={vi.fn()} />
			</Wrapper>,
		);

		fireEvent.click(
			within(entryGroup()).getByRole("button", { name: "Add criterion" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		expect(await screen.findByText("Enter the criterion.")).toBeTruthy();
	});
});

describe("StrategyList", () => {
	it("lists active strategies first and archived ones in a closed group", () => {
		render(
			<StrategyList
				strategies={[
					strategyOf({ id: 1, name: "Old setup", archivedAt: new Date() }),
					strategyOf({ id: 2, name: "Breakout" }),
				]}
				selectedId={null}
				onSelect={vi.fn()}
				onCreate={vi.fn()}
			/>,
		);

		const buttons = screen.getAllByRole("button", { hidden: true });
		expect(buttons.map((button) => button.textContent)).toEqual([
			"Breakout",
			"Old setup",
		]);
		const group = screen.getByText("Archived (1)").closest("details");
		expect(group?.open).toBe(false);
		expect(group?.textContent).toContain("Old setup");
	});
});
