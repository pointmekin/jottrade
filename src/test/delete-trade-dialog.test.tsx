// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteTradeDialog } from "@/components/journal/DeleteTradeDialog";
import { deleteTrade } from "@/server/tradeActions";

vi.mock("@/server/tradeActions", () => ({
	deleteTrade: vi.fn(),
}));

const trade = {
	id: 42,
	symbol: "AAPL",
	side: "LONG",
	entryDate: new Date("2025-01-03T16:30:00Z"),
};

function renderDialog(
	onDeleted = vi.fn(),
	queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	}),
) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	render(<DeleteTradeDialog trade={trade} onDeleted={onDeleted} />, {
		wrapper,
	});
	return { onDeleted, queryClient };
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("DeleteTradeDialog", () => {
	it("identifies the selected trade and cancels without deleting", async () => {
		renderDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete trade" }));

		expect(screen.getByText(/AAPL LONG/)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => {
			expect(screen.queryByRole("alertdialog")).toBeNull();
		});
		expect(deleteTrade).not.toHaveBeenCalled();
	});

	it("deletes once, refreshes dependent data, and reports success", async () => {
		vi.mocked(deleteTrade).mockResolvedValue({ success: true } as never);
		const onDeleted = vi.fn();
		const queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
				queries: { retry: false },
			},
		});
		const invalidate = vi
			.spyOn(queryClient, "invalidateQueries")
			.mockResolvedValue(undefined);
		renderDialog(onDeleted, queryClient);

		fireEvent.click(screen.getByRole("button", { name: "Delete trade" }));
		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
		expect(deleteTrade).toHaveBeenCalledOnce();
		expect(deleteTrade).toHaveBeenCalledWith({ data: { id: trade.id } });
		expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(
			[
				["trades"],
				["trade", trade.id],
				["calendar"],
				["analytics"],
				["advanced-analytics"],
			],
		);
	});

	it("blocks duplicate confirmation while deletion is pending", async () => {
		let resolveDelete: ((value: { success: true }) => void) | undefined;
		vi.mocked(deleteTrade).mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveDelete = resolve;
				}) as never,
		);
		renderDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete trade" }));
		const confirm = screen.getByRole("button", { name: "Delete permanently" });
		fireEvent.click(confirm);

		await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(true));
		fireEvent.click(confirm);
		expect(deleteTrade).toHaveBeenCalledOnce();
		await act(async () => {
			resolveDelete?.({ success: true });
		});
	});

	it("keeps the dialog open and shows a useful error when deletion fails", async () => {
		vi.mocked(deleteTrade).mockRejectedValue(new Error("Database unavailable"));
		renderDialog();

		fireEvent.click(screen.getByRole("button", { name: "Delete trade" }));
		fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

		expect((await screen.findByRole("alert")).textContent).toContain(
			"Database unavailable",
		);
		expect(screen.getByRole("alertdialog")).toBeTruthy();
	});
});
