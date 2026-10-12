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
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/command-palette/command-palette";
import type { CommandExtractionResult } from "@/lib/commands/intent-schema";
import { extractCommandIntent } from "@/server/commandIntentActions";
import { addCashFlow } from "@/server/portfolioActions";
import { createTrade } from "@/server/tradeActions";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), setTheme: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
}));
vi.mock("@/components/theme-provider", () => ({
	useTheme: () => ({ setTheme: mocks.setTheme }),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "u1" } } }) },
}));
vi.mock("@/hooks/use-accounts", () => ({
	accountsQueryKey: ["accounts"],
	useAccounts: () => ({
		accounts: [{ id: 7, name: "Main account", currency: "USD" }],
		activeAccount: { id: 7, name: "Main account", currency: "USD" },
	}),
}));
vi.mock("@/hooks/use-account-entries", () => ({
	accountEntriesQueryKey: ["cash-flows"],
}));
vi.mock("@/server/commandIntentActions", () => ({
	extractCommandIntent: vi.fn(),
}));
vi.mock("@/server/tradeActions", () => ({ createTrade: vi.fn() }));
vi.mock("@/server/portfolioActions", () => ({ addCashFlow: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
beforeAll(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});
function setup(query = "I put another thousand dollars into my account") {
	function Harness() {
		const [open, setOpen] = useState(true);
		return <CommandPalette open={open} onOpenChange={setOpen} />;
	}
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { mutations: { retry: false } } })
			}
		>
			<Harness />
		</QueryClientProvider>,
	);
	fireEvent.change(screen.getByRole("combobox"), { target: { value: query } });
}
function interpret() {
	fireEvent.click(
		screen.getByRole("button", { name: "Interpret with Gemini" }),
	);
}
const trade: CommandExtractionResult = {
	intent: {
		type: "trade",
		params: {
			symbol: "XAUUSDM",
			side: "SHORT",
			entryPrice: "4550",
			quantity: "0.01",
			quantityUnit: "LOTS",
			targetPrice: "4500",
		},
	},
};
describe("explicit Gemini fallback", () => {
	it.each([
		"journal",
		"dark mode",
		"short gold 4550 target 4500 0.01 lot",
		"deposit 1000",
	])("keeps %s local", (query) => {
		setup(query);
		expect(screen.queryByRole("button", { name: /Gemini/ })).toBeNull();
		expect(extractCommandIntent).not.toHaveBeenCalled();
	});
	it("discloses sending text and makes no request until invoked", async () => {
		setup();
		expect(screen.getByText(/sends this command text to Google/)).toBeTruthy();
		expect(extractCommandIntent).not.toHaveBeenCalled();
		vi.mocked(extractCommandIntent).mockResolvedValue({
			intent: {
				type: "account-entry",
				params: { kind: "DEPOSIT", amount: "1000", currency: "USD" },
			},
		});
		interpret();
		await screen.findByLabelText("Amount (USD)");
		expect(addCashFlow).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
		await waitFor(() =>
			expect(addCashFlow).toHaveBeenCalledWith({
				data: expect.objectContaining({ amount: 1000, portfolioId: 7 }),
			}),
		);
	});
	it("uses the same editable trade preview without changing units or target", async () => {
		setup("sold gold around 4550 with 0.01 lots aiming for 4500");
		vi.mocked(extractCommandIntent).mockResolvedValue(trade);
		interpret();
		expect(
			((await screen.findByLabelText("Quantity (lots)")) as HTMLInputElement)
				.value,
		).toBe("0.01");
		expect(createTrade).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
		await waitFor(() =>
			expect(createTrade).toHaveBeenCalledWith({
				data: expect.objectContaining({
					quantity: "0.01",
					targetPrice: "4500",
					side: "SHORT",
				}),
			}),
		);
	});
	it("leaves missing fields empty, including side", async () => {
		setup();
		vi.mocked(extractCommandIntent).mockResolvedValue({
			intent: { type: "trade", params: { symbol: "GOLD" } },
		});
		interpret();
		expect(
			((await screen.findByLabelText("Side")) as HTMLSelectElement).value,
		).toBe("");
		expect(
			(screen.getByLabelText("Entry price") as HTMLInputElement).value,
		).toBe("");
		expect(
			(screen.getByLabelText("Quantity (lots)") as HTMLInputElement).value,
		).toBe("");
		expect(createTrade).not.toHaveBeenCalled();
	});
	it("does not reinterpret units as lots", async () => {
		setup();
		vi.mocked(extractCommandIntent).mockResolvedValue({
			intent: {
				type: "trade",
				params: {
					symbol: "GOLD",
					side: "SHORT",
					entryPrice: "4550",
					quantity: "1",
					quantityUnit: "UNITS",
				},
			},
		});
		interpret();
		await screen.findByText(/command specifies units/i);
		expect(
			(
				screen.getByRole("button", {
					name: "Confirm and save",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(createTrade).not.toHaveBeenCalled();
	});
	it("preserves currency mismatch protection", async () => {
		setup();
		vi.mocked(extractCommandIntent).mockResolvedValue({
			intent: {
				type: "account-entry",
				params: { kind: "WITHDRAWAL", amount: "1000", currency: "EUR" },
			},
		});
		interpret();
		await screen.findByText(/command specifies EUR/);
		expect(
			(
				screen.getByRole("button", {
					name: "Confirm and save",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});
	it.each([
		{ error: "Gemini is not configured. You can still use local commands." },
		{ intent: { type: "unknown" } },
	] as CommandExtractionResult[])(
		"keeps local commands usable after an unsuccessful interpretation",
		async (result) => {
			setup();
			vi.mocked(extractCommandIntent).mockResolvedValue(result);
			interpret();
			await screen.findByRole("alert");
			fireEvent.change(screen.getByRole("combobox"), {
				target: { value: "journal" },
			});
			fireEvent.click(screen.getByRole("option", { name: /Journal/ }));
			expect(mocks.navigate).toHaveBeenCalledWith({ to: "/journal" });
		},
	);
	it("handles transport errors", async () => {
		setup();
		vi.mocked(extractCommandIntent).mockRejectedValue(new Error("secret"));
		interpret();
		expect((await screen.findByRole("alert")).textContent).not.toContain(
			"secret",
		);
	});
	it.each(["edit", "close", "select", "unmount"])(
		"ignores a response after %s",
		async (action) => {
			setup("short gold");
			let resolve!: (value: CommandExtractionResult) => void;
			vi.mocked(extractCommandIntent).mockReturnValue(
				new Promise((done) => {
					resolve = done;
				}),
			);
			interpret();
			expect(
				(
					screen.getByRole("button", {
						name: /Interpreting/,
					}) as HTMLButtonElement
				).disabled,
			).toBe(true);
			if (action === "edit")
				fireEvent.change(screen.getByRole("combobox"), {
					target: { value: "journal" },
				});
			if (action === "close")
				fireEvent.keyDown(document, { key: "k", ctrlKey: true });
			if (action === "select")
				fireEvent.click(screen.getByRole("option", { name: /Log short/ }));
			if (action === "unmount") cleanup();
			await act(async () =>
				resolve({ intent: { type: "theme", theme: "dark" } }),
			);
			expect(mocks.setTheme).not.toHaveBeenCalled();
			expect(createTrade).not.toHaveBeenCalled();
		},
	);
	it("offers interpreted navigation for selection before navigating", async () => {
		setup("please take me over to the trading diary");
		vi.mocked(extractCommandIntent).mockResolvedValue({
			intent: { type: "navigation", path: "/journal" },
		});
		interpret();
		await screen.findByRole("option", { name: /Journal/ });
		expect(mocks.navigate).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("option", { name: /Journal/ }));
		expect(mocks.navigate).toHaveBeenCalledWith({ to: "/journal" });
	});
});
