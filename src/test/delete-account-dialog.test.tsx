// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { deleteAccount } from "@/server/portfolioActions";

const state = vi.hoisted(() => ({
	activeAccountId: 1,
	clearActiveAccount: vi.fn(),
}));

vi.mock("@/server/portfolioActions", () => ({
	deleteAccount: vi.fn(),
}));

vi.mock("@/hooks/use-accounts", () => ({
	accountsQueryKey: ["accounts"],
	useAccounts: () => ({
		activeAccount: {
			id: state.activeAccountId,
			name: "Main account",
			description: null,
			kind: "REAL",
			currency: "USD",
			isDefault: true,
			tradeCount: 0,
		},
		clearActiveAccount: state.clearActiveAccount,
		setActiveAccount: vi.fn(),
		accounts: [],
		isLoading: false,
		isError: false,
	}),
}));

const account = {
	id: 7,
	name: "Exness Demo",
	description: "Practice account",
	kind: "DEMO" as const,
	currency: "USD",
	isDefault: false,
	tradeCount: 12,
};

function renderDialog(onOpenChange = vi.fn()) {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	render(<DeleteAccountDialog account={account} onOpenChange={onOpenChange} />, {
		wrapper,
	});
	return { onOpenChange, queryClient };
}

function typeConfirmation(value: string) {
	fireEvent.change(screen.getByLabelText(/type/i), {
		target: { value },
	});
}

afterEach(() => {
	vi.clearAllMocks();
	state.activeAccountId = 1;
});

describe("DeleteAccountDialog", () => {
	it("keeps deletion disabled until the exact account name is typed", () => {
		renderDialog();

		const confirm = screen.getByRole("button", {
			name: "Delete permanently",
		});
		expect(confirm.hasAttribute("disabled")).toBe(true);

		typeConfirmation("exness demo");
		expect(confirm.hasAttribute("disabled")).toBe(true);

		typeConfirmation("Exness Demo");
		expect(confirm.hasAttribute("disabled")).toBe(false);
	});

	it("sends the typed confirmation on delete", async () => {
		vi.mocked(deleteAccount).mockResolvedValue({ success: true } as never);
		const onOpenChange = vi.fn();
		renderDialog(onOpenChange);

		typeConfirmation("Exness Demo");
		fireEvent.click(
			screen.getByRole("button", { name: "Delete permanently" }),
		);

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(deleteAccount).toHaveBeenCalledOnce();
		expect(deleteAccount).toHaveBeenCalledWith({
			data: { id: 7, confirmName: "Exness Demo" },
		});
	});

	it("clears the active account when the active account was deleted", async () => {
		vi.mocked(deleteAccount).mockResolvedValue({ success: true } as never);
		state.activeAccountId = 7;
		const onOpenChange = vi.fn();
		renderDialog(onOpenChange);

		typeConfirmation("Exness Demo");
		fireEvent.click(
			screen.getByRole("button", { name: "Delete permanently" }),
		);

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(state.clearActiveAccount).toHaveBeenCalledOnce();
	});

	it("keeps the active account when another account was deleted", async () => {
		vi.mocked(deleteAccount).mockResolvedValue({ success: true } as never);
		const queryClient = new QueryClient({
			defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
		});
		const invalidate = vi
			.spyOn(queryClient, "invalidateQueries")
			.mockResolvedValue(undefined);
		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
		const onOpenChange = vi.fn();
		render(
			<DeleteAccountDialog account={account} onOpenChange={onOpenChange} />,
			{ wrapper },
		);

		typeConfirmation("Exness Demo");
		fireEvent.click(
			screen.getByRole("button", { name: "Delete permanently" }),
		);

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(state.clearActiveAccount).not.toHaveBeenCalled();
		const invalidatedKeys = invalidate.mock.calls.map(
			([filters]) => filters?.queryKey,
		);
		expect(invalidatedKeys).toContainEqual(["accounts"]);
		expect(invalidatedKeys).toContainEqual(["trades"]);
	});
});
