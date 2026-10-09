// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrategyStatusActions } from "@/components/strategies/strategy-status-actions";
import type { Strategy } from "@/lib/playbook";
import { archiveStrategy, deleteStrategy } from "@/server/strategyActions";

vi.mock("@/server/strategyActions", () => ({
	archiveStrategy: vi.fn(),
	deleteStrategy: vi.fn(),
}));

const breakout: Strategy = {
	id: 7,
	userId: "u",
	name: "Breakout",
	description: null,
	criteria: [],
	riskGuidance: null,
	criteriaVersion: 1,
	archivedAt: null,
};
const archived = { ...breakout, archivedAt: new Date("2026-10-01") };

function renderActions(strategy: Strategy, onChanged = vi.fn()) {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	render(
		<StrategyStatusActions
			strategy={strategy}
			onChanged={onChanged}
			onDeleted={vi.fn()}
		/>,
		{ wrapper },
	);
	return { onChanged };
}

const confirmDelete = async () => {
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));
	const dialog = await screen.findByRole("alertdialog");
	fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
	return dialog;
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("StrategyStatusActions", () => {
	it("offers Archive when trades use the strategy, and archives it", async () => {
		vi.mocked(deleteStrategy).mockResolvedValue({ deleted: false, usedBy: 3 });
		vi.mocked(archiveStrategy).mockResolvedValue(archived);
		const { onChanged } = renderActions(breakout);

		const dialog = await confirmDelete();
		expect(
			await within(dialog).findByText(
				"3 trades use this strategy. Archive it instead.",
			),
		).toBeTruthy();
		expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
		fireEvent.click(within(dialog).getByRole("button", { name: "Archive" }));

		await waitFor(() => expect(onChanged).toHaveBeenCalledWith(archived));
		expect(archiveStrategy).toHaveBeenCalledWith({
			data: { id: 7, archived: true },
		});
	});

	it("does not offer Archive for an archived strategy that trades use", async () => {
		vi.mocked(deleteStrategy).mockResolvedValue({ deleted: false, usedBy: 1 });
		renderActions(archived);

		const dialog = await confirmDelete();

		expect(
			await within(dialog).findByText("1 trade uses this strategy."),
		).toBeTruthy();
		expect(
			within(dialog).queryByRole("button", { name: "Archive" }),
		).toBeNull();
	});

	it("shows any other delete error without an Archive offer", async () => {
		vi.mocked(deleteStrategy).mockRejectedValue(new Error("Network down"));
		renderActions(breakout);

		const dialog = await confirmDelete();

		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Network down",
		);
		expect(
			within(dialog).queryByRole("button", { name: "Archive" }),
		).toBeNull();
	});

	it("labels the button Archive or Restore from the strategy state", async () => {
		renderActions(breakout);
		expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
		cleanup();

		renderActions(archived);
		fireEvent.click(screen.getByRole("button", { name: "Restore" }));

		await waitFor(() =>
			expect(archiveStrategy).toHaveBeenCalledWith({
				data: { id: 7, archived: false },
			}),
		);
	});

	it("shows the archive error", async () => {
		vi.mocked(archiveStrategy).mockRejectedValue(new Error("Archive failed"));
		renderActions(breakout);

		fireEvent.click(screen.getByRole("button", { name: "Archive" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Archive failed",
		);
	});
});
