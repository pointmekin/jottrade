// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSwitcher } from "@/components/account/account-switcher";
import { SidebarProvider } from "@/components/ui/sidebar";

const state = vi.hoisted(() => ({ isError: false, refetch: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/server/portfolioActions", () => ({
	createAccount: vi.fn(),
	updateAccount: vi.fn(),
}));

vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({
		accounts: [],
		activeAccount: undefined,
		setActiveAccount: vi.fn(),
		clearActiveAccount: vi.fn(),
		isLoading: false,
		isError: state.isError,
		refetch: state.refetch,
	}),
}));

function renderSwitcher() {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<SidebarProvider>
				<AccountSwitcher />
			</SidebarProvider>
		</QueryClientProvider>,
	);
}

afterEach(() => {
	vi.clearAllMocks();
	state.isError = false;
});

describe("AccountSwitcher", () => {
	it("shows a load error and retries the account query", () => {
		state.isError = true;
		renderSwitcher();

		expect(screen.getByRole("alert").textContent).toContain(
			"Accounts did not load",
		);
		fireEvent.click(screen.getByRole("button", { name: /retry/i }));

		expect(state.refetch).toHaveBeenCalledOnce();
	});

	it("shows no error while accounts load normally", () => {
		renderSwitcher();

		expect(screen.queryByRole("alert")).toBeNull();
	});
});
