// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountFormDialog } from "@/components/account/account-form-dialog";

vi.mock("@/server/portfolioActions", () => ({
	createAccount: vi.fn(),
	updateAccount: vi.fn(),
}));

function renderDialog(
	account: Parameters<typeof AccountFormDialog>[0]["account"],
) {
	const client = new QueryClient();
	render(<AccountFormDialog open onOpenChange={vi.fn()} account={account} />, {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		),
	});
}

describe("AccountFormDialog currency protection", () => {
	it.each([
		{ tradeCount: 1, cashFlowCount: 0 },
		{ tradeCount: 0, cashFlowCount: 1 },
	])("locks currency when account activity exists", (activity) => {
		renderDialog({
			id: 1,
			name: "Main account",
			description: null,
			kind: "REAL",
			currency: "USD",
			isDefault: true,
			...activity,
		});

		expect(
			screen
				.getByRole("combobox", { name: "Reporting currency" })
				.hasAttribute("disabled"),
		).toBe(true);
		expect(
			screen.getByText(
				"Account currency cannot be changed after trading activity exists.",
			),
		).toBeTruthy();
	});
});
