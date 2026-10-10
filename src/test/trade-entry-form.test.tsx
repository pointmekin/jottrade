// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeEntryForm } from "@/components/journal/TradeEntryForm";
import { type TradeDraft, tradeDraftKey } from "@/lib/trade-draft";
import { createTrade } from "@/server/tradeActions";

const state = vi.hoisted(() => ({
	accounts: [
		{ id: 7, name: "USD account", currency: "USD" },
		{ id: 8, name: "THB account", currency: "THB" },
	],
	activeAccount: { id: 7, name: "USD account", currency: "USD" },
	strategies: [] as { id: number; name: string; archivedAt: Date | null }[],
}));
vi.mock("@/hooks/use-accounts", () => ({ useAccounts: () => state }));
vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "u1" } } }) },
}));
vi.mock("@/server/tradeActions", () => ({ createTrade: vi.fn() }));
vi.mock("@/server/riskRuleActions", () => ({
	getRuleContext: async () => ({ version: null }),
}));
vi.mock("@/server/strategyActions", () => ({
	getStrategies: async () => state.strategies,
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children }: { to: string; children: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const KEY_7 = tradeDraftKey("u1", 7);
const KEY_8 = tradeDraftKey("u1", 8);

function setup(child: ReactNode = <TradeEntryForm />) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>{child}</QueryClientProvider>,
	);
}
function fill(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function input(label: string) {
	return screen.getByLabelText(label) as HTMLInputElement;
}
function stored(key: string): TradeDraft {
	return JSON.parse(localStorage.getItem(key) ?? "null");
}
function fillTrade() {
	fill("Symbol", "AAPL");
	fill("Entry price", "100");
	fill("Quantity (units)", "2");
	fill("Notes", "Waited for the retest.");
}
function storeDraft(values: TradeDraft["values"]) {
	const draft: TradeDraft = {
		v: 1,
		draftId: "7b0f8a52-61f3-4c1e-9c51-1f6f0f4c2b10",
		savedAt: new Date().toISOString(),
		values,
	};
	localStorage.setItem(KEY_7, JSON.stringify(draft));
	return draft;
}

beforeEach(() => {
	localStorage.clear();
	state.activeAccount = state.accounts[0];
	state.strategies = [];
	vi.mocked(createTrade).mockResolvedValue({
		success: true,
		id: 1,
		duplicate: false,
		ruleCheck: null,
	});
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("log trade draft", () => {
	it("writes the draft after a pause and restores it after a remount", async () => {
		const view = setup();
		fillTrade();
		await waitFor(() => expect(stored(KEY_7)?.values.symbol).toBe("AAPL"));
		expect(
			screen.getByText(/Draft on this device\. Not in your journal yet\./),
		).toBeTruthy();
		fill("Notes", "Changed before close.");
		view.unmount();

		setup();
		expect(input("Symbol").value).toBe("AAPL");
		expect(input("Notes").value).toBe("Changed before close.");
		expect(screen.getByText(/Last change/)).toBeTruthy();
	});

	it("keeps the draft on its account and shows only the draft of the active account", () => {
		const view = setup();
		fillTrade();
		state.activeAccount = state.accounts[1];
		view.unmount();
		expect(stored(KEY_7).values.symbol).toBe("AAPL");

		const other = setup();
		expect(screen.getByText(/THB account/)).toBeTruthy();
		expect(input("Symbol").value).toBe("");
		expect(screen.queryByText(/Draft on this device/)).toBeNull();
		other.unmount();
		expect(localStorage.getItem(KEY_8)).toBeNull();

		state.activeAccount = state.accounts[0];
		setup();
		expect(input("Symbol").value).toBe("AAPL");
	});

	it("keeps the draft after a failed save and sends the same draft id on retry", async () => {
		vi.mocked(createTrade)
			.mockRejectedValueOnce(new Error("Network error"))
			.mockResolvedValueOnce({
				success: true,
				id: 5,
				duplicate: true,
				ruleCheck: null,
			});
		const onSuccess = vi.fn();
		setup(<TradeEntryForm onSuccess={onSuccess} />);
		fillTrade();
		fireEvent.click(screen.getByRole("button", { name: "Log Long" }));
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Not saved. Your draft stays on this device.",
			),
		);
		expect(screen.getByRole("alert").textContent).toContain("Network error");
		expect(stored(KEY_7).values.notes).toBe("Waited for the retest.");

		fireEvent.click(screen.getByRole("button", { name: "Log Long" }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
		const [first, second] = vi
			.mocked(createTrade)
			.mock.calls.map(([call]) => call.data.clientDraftId);
		expect(first).toBe(stored(KEY_7)?.draftId ?? first);
		expect(second).toBe(first);
		expect(localStorage.getItem(KEY_7)).toBeNull();
		expect(toast.success).toHaveBeenCalledWith("Trade saved to journal");
	});

	it("sends the restored draft id and deletes the draft after a save", async () => {
		const draft = storeDraft({
			symbol: "AAPL",
			entryPrice: "100",
			quantity: "2",
		});
		setup();
		fireEvent.click(screen.getByRole("button", { name: "Log Long" }));
		await waitFor(() => expect(createTrade).toHaveBeenCalledOnce());
		expect(vi.mocked(createTrade).mock.calls[0][0].data.clientDraftId).toBe(
			draft.draftId,
		);
		await waitFor(() => expect(localStorage.getItem(KEY_7)).toBeNull());
	});

	it("keeps a draft that cannot be read until the user discards it", async () => {
		localStorage.setItem(KEY_7, "{bad json");
		setup();
		expect(screen.getByRole("alert").textContent).toContain(
			"This draft cannot be read. Discard it.",
		);
		fillTrade();
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect(localStorage.getItem(KEY_7)).toBe("{bad json");

		fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
		fireEvent.click(screen.getByRole("button", { name: "Discard" }));
		expect(localStorage.getItem(KEY_7)).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("discards a restored draft after a confirmation", () => {
		storeDraft({ symbol: "AAPL" });
		setup();
		fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
		fireEvent.click(screen.getByRole("button", { name: "Keep draft" }));
		expect(localStorage.getItem(KEY_7)).not.toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
		fireEvent.click(screen.getByRole("button", { name: "Discard" }));
		expect(localStorage.getItem(KEY_7)).toBeNull();
		expect(input("Symbol").value).toBe("");
		expect(screen.queryByText(/Draft on this device/)).toBeNull();
	});

	it("drops a restored strategy that is archived", async () => {
		state.strategies = [{ id: 9, name: "Old setup", archivedAt: new Date() }];
		storeDraft({
			symbol: "AAPL",
			entryPrice: "100",
			quantity: "2",
			setupId: 9,
		});
		setup();
		await waitFor(() => expect(stored(KEY_7).values.setupId).toBeNull());
		fireEvent.click(screen.getByRole("button", { name: "Log Long" }));
		await waitFor(() => expect(createTrade).toHaveBeenCalledOnce());
		expect(vi.mocked(createTrade).mock.calls[0][0].data.setupId).toBeNull();
	});

	it("asks before a new prefilled trade replaces a stored draft", () => {
		storeDraft({ symbol: "AAPL" });
		const preset = { portfolioId: 7, symbol: "EURUSD", entryPrice: "1.1" };
		const view = setup(<TradeEntryForm initialDraft={preset} />);
		fireEvent.click(
			screen.getByRole("button", { name: "Continue your draft" }),
		);
		expect(input("Symbol").value).toBe("AAPL");
		view.unmount();

		setup(<TradeEntryForm initialDraft={preset} />);
		fireEvent.click(screen.getByRole("button", { name: "Start new" }));
		expect(input("Symbol").value).toBe("EURUSD");
		expect(localStorage.getItem(KEY_7)).toBeNull();
	});
});
