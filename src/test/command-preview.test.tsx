// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPreview } from "@/components/command-palette/command-preview";
import type { WriteIntent } from "@/lib/commands/types";
import { addCashFlow } from "@/server/portfolioActions";
import { createTrade } from "@/server/tradeActions";

const state = vi.hoisted(() => ({
	accounts: [{ id: 7, name: "Main account", currency: "USD" }],
	activeAccount: { id: 7, name: "Main account", currency: "USD" },
}));
vi.mock("@/hooks/use-accounts", () => ({
	accountsQueryKey: ["accounts"],
	useAccounts: () => state,
}));
vi.mock("@/hooks/use-account-entries", () => ({
	accountEntriesQueryKey: ["cash-flows"],
}));
vi.mock("@/server/tradeActions", () => ({ createTrade: vi.fn() }));
vi.mock("@/server/portfolioActions", () => ({ addCashFlow: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const trade: WriteIntent = {
	type: "trade",
	params: {
		symbol: "XAUUSDM",
		side: "SHORT",
		entryPrice: "4550",
		targetPrice: "4500",
		quantity: "0.01",
	},
};
function setup(intent: WriteIntent = trade) {
	const client = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	const invalidate = vi
		.spyOn(client, "invalidateQueries")
		.mockResolvedValue(undefined);
	const onSuccess = vi.fn();
	const onBack = vi.fn();
	render(
		<QueryClientProvider client={client}>
			<CommandPreview intent={intent} onBack={onBack} onSuccess={onSuccess} />
		</QueryClientProvider>,
	);
	return { invalidate, onSuccess, onBack };
}
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	state.accounts = [{ id: 7, name: "Main account", currency: "USD" }];
});
describe("command confirmation", () => {
	it("previews without writing, then saves unchanged lots and target", async () => {
		const { onSuccess, invalidate } = setup();
		expect(createTrade).not.toHaveBeenCalled();
		expect(
			(screen.getByLabelText("Quantity (lots)") as HTMLInputElement).value,
		).toBe("0.01");
		fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
		expect(createTrade).toHaveBeenCalledWith({
			data: expect.objectContaining({
				portfolioId: 7,
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4550",
				quantity: "0.01",
				targetPrice: "4500",
			}),
		});
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["analytics"] });
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: ["strategy-performance"],
		});
	});
	it("lets users complete missing fields", async () => {
		setup({ type: "trade", params: { symbol: "EURUSD", side: "LONG" } });
		fireEvent.change(screen.getByLabelText("Entry price"), {
			target: { value: "1.1735" },
		});
		fireEvent.change(screen.getByLabelText("Quantity (lots)"), {
			target: { value: "0.1" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
		await waitFor(() => expect(createTrade).toHaveBeenCalledOnce());
	});
	it.each([
		["DEPOSIT", 250],
		["WITHDRAWAL", -250],
	] as const)("saves %s with the accounting sign", async (kind, amount) => {
		setup({ type: "account-entry", params: { kind, amount: "250" } });
		fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
		await waitFor(() =>
			expect(addCashFlow).toHaveBeenCalledWith({
				data: expect.objectContaining({ kind, amount, portfolioId: 7 }),
			}),
		);
	});
	it("blocks currency mismatches and missing accounts", () => {
		setup({
			type: "account-entry",
			params: { kind: "DEPOSIT", amount: "100", currency: "THB" },
		});
		expect(
			screen
				.getByRole("button", { name: "Confirm and save" })
				.hasAttribute("disabled"),
		).toBe(true);
		expect(screen.getByRole("alert").textContent).toContain("THB");
	});
	it("blocks duplicate saves while pending", async () => {
		let resolveSave: (() => void) | undefined;
		vi.mocked(createTrade).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveSave = () => resolve({ success: true });
				}),
		);
		setup();
		const button = screen.getByRole("button", { name: "Confirm and save" });
		fireEvent.click(button);
		fireEvent.click(button);
		await waitFor(() => expect(createTrade).toHaveBeenCalledOnce());
		await act(async () => resolveSave?.());
	});
	it("keeps values after an error", async () => {
		vi.mocked(createTrade).mockRejectedValueOnce(new Error("Database failure"));
		const { onSuccess } = setup();
		fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
		expect((await screen.findByRole("alert")).textContent).toContain(
			"Could not save",
		);
		expect(
			(screen.getByLabelText("Entry price") as HTMLInputElement).value,
		).toBe("4550");
		expect(onSuccess).not.toHaveBeenCalled();
	});
	it("goes back without saving", () => {
		const { onBack } = setup();
		fireEvent.click(screen.getByRole("button", { name: "Back" }));
		expect(onBack).toHaveBeenCalledOnce();
		expect(createTrade).not.toHaveBeenCalled();
	});
});
