// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TradeEntryForm } from "@/components/journal/TradeEntryForm";

vi.mock("@/server/tradeActions", () => ({ createTrade: vi.fn() }));
vi.mock("@/hooks/use-accounts", () => ({
	accountsQueryKey: ["accounts"],
	useAccounts: () => ({ activeAccount: { id: 1 } }),
}));

function renderForm() {
	const client = new QueryClient();
	return render(<TradeEntryForm />, {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		),
	});
}

describe("TradeEntryForm quantity semantics", () => {
	it.each([
		["EURUSD", "1 standard lot = 100,000 units"],
		["XAUUSDm", "1 lot = 100 oz"],
	])("labels %s quantity as lots", (symbol, helper) => {
		renderForm();

		fireEvent.change(screen.getByLabelText("Symbol"), {
			target: { value: symbol },
		});

		expect(screen.getByLabelText("Quantity (lots)")).toBeTruthy();
		expect(screen.getByText(helper)).toBeTruthy();
	});

	it("keeps unknown instruments unit-based and preserves lot precision", () => {
		renderForm();
		const symbol = screen.getByLabelText("Symbol");

		fireEvent.change(symbol, { target: { value: "AAPL" } });
		expect(screen.getByLabelText("Quantity")).toBeTruthy();

		fireEvent.change(symbol, { target: { value: "EURUSD" } });
		const quantity = screen.getByLabelText("Quantity (lots)");
		fireEvent.change(quantity, { target: { value: "3.525" } });
		expect((quantity as HTMLInputElement).value).toBe("3.525");
	});
});
