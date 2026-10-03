// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPreview } from "@/components/command-palette/command-preview";
import { TradeEntryForm } from "@/components/journal/TradeEntryForm";
import { TradeOverviewForm } from "@/components/journal/trade-overview-form";
import { TradeRiskCorrectionForm } from "@/components/journal/trade-risk-correction-form";
import { TradeRiskDetails } from "@/components/journal/trade-risk-details";
import { SetupCalculator } from "@/components/tools/SetupCalculator";
import { toCommandCandidate } from "@/lib/commands/intent-schema";
import { parseTrade } from "@/lib/commands/parsers/trade";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { calculateInitialRisk } from "@/lib/trade-risk";
import { createTrade, updateTrade } from "@/server/tradeActions";
import { correctTradeInitialRisk } from "@/server/tradeRiskActions";

const state = vi.hoisted(() => ({
	accounts: [
		{ id: 7, name: "USD account", currency: "USD" },
		{ id: 8, name: "THB account", currency: "THB" },
	],
	activeAccount: { id: 7, name: "USD account", currency: "USD" },
}));
vi.mock("@/hooks/use-accounts", () => ({ useAccounts: () => state }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/server/tradeActions", () => ({
	createTrade: vi.fn(),
	updateTrade: vi.fn(),
}));
vi.mock("@/server/strategyActions", () => ({ getStrategies: async () => [] }));
vi.mock("@/server/tradeRiskActions", () => ({
	correctTradeInitialRisk: vi.fn(),
}));
vi.mock("@/server/getAnalytics", () => ({
	getAnalytics: async () => ({ stats: { totalBalance: 10000 } }),
}));
vi.mock("@/server/cashFlowActions", () => ({ addCashFlow: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const capture = {
	symbol: "EURUSD",
	side: TradeSide.Long,
	entryPrice: "1.1",
	quantity: "0.2",
	initialStopPrice: "1.095",
	targetPrice: "1.11",
	entryDate: "2026-10-01T10:00:00Z",
	accountCurrency: "USD",
	balanceAccount: "10000",
};
function setup(child: React.ReactNode) {
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
beforeEach(() => {
	vi.mocked(createTrade).mockResolvedValue({ success: true });
	vi.mocked(updateTrade).mockResolvedValue({ success: true });
	state.activeAccount = state.accounts[0];
	window.matchMedia = vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
	});
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("risk capture flows", () => {
	it("a correction conflict retains edited inputs and the reviewed revision and entry time", async () => {
		const entryDate = "2026-10-01T10:00:32.123Z";
		const plan = calculateInitialRisk({ ...capture, entryDate });
		const trade = {
			...plan,
			id: 2,
			portfolioId: 7,
			editRevision: 4,
			symbol: capture.symbol,
			side: capture.side,
			status: TradeStatus.Open,
			entryDate: new Date(entryDate),
			exitDate: null,
			exitPrice: null,
			netPnl: null,
			returnPercent: null,
			entryPrice: capture.entryPrice,
			quantity: capture.quantity,
		};
		vi.mocked(correctTradeInitialRisk).mockRejectedValue(
			new Error("Trade changed. Reload before correcting."),
		);
		const view = setup(
			<TradeRiskCorrectionForm trade={trade} onClose={vi.fn()} />,
		);
		fill("Quantity (lots)", "0.1");
		fill("Correction reason", "Quantity typo");
		view.rerender(
			<QueryClientProvider client={new QueryClient()}>
				<TradeRiskCorrectionForm
					trade={{ ...trade, editRevision: 5 }}
					onClose={vi.fn()}
				/>
			</QueryClientProvider>,
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Confirm original-plan correction" }),
		);
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain("Trade changed"),
		);
		expect(vi.mocked(correctTradeInitialRisk).mock.calls[0][0].data).toEqual(
			expect.objectContaining({
				expectedRevision: 4,
				entryDate,
				quantity: "0.1",
				reason: "Quantity typo",
			}),
		);
		expect(
			(screen.getByLabelText("Quantity (lots)") as HTMLInputElement).value,
		).toBe("0.1");
	});
	it("ordinary overview save preserves the exact exit instant", async () => {
		setup(
			<TradeOverviewForm
				trade={{
					...calculateInitialRisk(capture),
					id: 2,
					portfolioId: 7,
					editRevision: 4,
					symbol: capture.symbol,
					side: capture.side,
					status: TradeStatus.Closed,
					entryDate: new Date(capture.entryDate),
					exitDate: new Date("2026-10-01T12:00:32.123Z"),
					entryPrice: capture.entryPrice,
					exitPrice: "1.11",
					quantity: capture.quantity,
					fees: "5",
					netPnl: "195",
					returnPercent: "0.91",
				}}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
		await waitFor(() => expect(updateTrade).toHaveBeenCalledOnce());
		expect(vi.mocked(updateTrade).mock.calls[0][0].data.exitDate).toBe(
			"2026-10-01T12:00:32.123Z",
		);
	});
	it("manual entry captures a reviewed account and preserves inputs after failed save", async () => {
		vi.mocked(createTrade).mockRejectedValueOnce(
			new Error("Synthetic save failure"),
		);
		const view = setup(<TradeEntryForm />);
		fill("Symbol", "EURUSD");
		fill("Entry price", "1.1");
		fill("Quantity (lots)", "0.2");
		fill("Initial stop price", "1.095");
		fill("Planned target price", "1.11");
		fill("Balance used for risk %", "10000");
		expect(screen.getByText(/Initial risk \$100.00/)).toBeTruthy();
		state.activeAccount = state.accounts[1];
		view.rerender(
			<QueryClientProvider client={new QueryClient()}>
				<TradeEntryForm />
			</QueryClientProvider>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Log Long" }));
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Synthetic save failure",
			),
		);
		expect(
			(screen.getByLabelText("Initial stop price") as HTMLInputElement).value,
		).toBe("1.095");
		expect(vi.mocked(createTrade).mock.calls[0][0].data.portfolioId).toBe(7);
	});
	it("typed and extracted commands retain the same stop, lots and original risk as the form", async () => {
		const candidates = [
			parseTrade("buy eurusd at 1.1 sl 1.095 target 1.11 0.2 lot"),
			toCommandCandidate({
				intent: "trade",
				symbol: "eurusd",
				side: TradeSide.Long,
				entryPrice: "1.1",
				initialStopPrice: "1.095",
				targetPrice: "1.11",
				quantity: "0.2",
			}),
		];
		for (const candidate of candidates) {
			if (!candidate || candidate.intent.type !== "trade")
				throw new Error("Expected a trade intent");
			setup(
				<CommandPreview
					intent={candidate.intent}
					onBack={vi.fn()}
					onSuccess={vi.fn()}
				/>,
			);
			fill("Balance used for risk %", "10000");
			fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
			await waitFor(() => expect(createTrade).toHaveBeenCalled());
			const saved = vi.mocked(createTrade).mock.calls.at(-1)?.[0].data;
			if (!saved) throw new Error("Expected saved values");
			expect(saved.initialStopPrice).toBe("1.095");
			expect(saved.quantity).toBe("0.2");
			expect(
				Number(
					calculateInitialRisk({ ...saved, accountCurrency: "USD" })
						.initialRiskAmount,
				),
			).toBeCloseTo(Number(calculateInitialRisk(capture).initialRiskAmount), 8);
			cleanup();
			vi.mocked(createTrade).mockClear();
		}
	});
	it("command preview can add a closed cross-currency outcome without reusing entry FX", async () => {
		setup(
			<CommandPreview
				intent={{
					type: "trade",
					params: {
						symbol: "EURJPY",
						side: TradeSide.Long,
						entryPrice: "169",
						quantity: "0.15",
						initialStopPrice: "168",
					},
				}}
				onBack={vi.fn()}
				onSuccess={vi.fn()}
			/>,
		);
		fill("Entry FX rate (account money per quote unit)", String(1 / 150));
		fill("Exit price", "171");
		fill("Exit date", "2026-10-01T12:00");
		fill("Exit FX rate (account money per quote unit)", "0.00625");
		fill("Fees (account currency)", "5");
		fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
		await waitFor(() => expect(createTrade).toHaveBeenCalledOnce());
		const saved = vi.mocked(createTrade).mock.calls[0][0].data;
		expect(saved.entryQuoteToAccountRate).not.toBe(
			saved.exitQuoteToAccountRate,
		);
		expect(saved.exitPrice).toBe("171");
		expect(saved.exitDate).toBeTruthy();
	});
	it("calculator populates the reviewed trade form with lots and risk inputs", async () => {
		setup(<SetupCalculator />);
		await waitFor(() =>
			expect(
				(screen.getByLabelText("Balance used for risk %") as HTMLInputElement)
					.value,
			).toBe("10000"),
		);
		fill("Symbol", "EURUSD");
		fill("Entry price", "1.1");
		fill("Initial target price", "1.11");
		fill("Initial stop price", "1.095");
		await waitFor(() =>
			expect(screen.getByText(/Suggested quantity: 0.2/)).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole("button", { name: "Use in trade" }));
		await waitFor(() =>
			expect(screen.getByLabelText("Quantity (lots)")).toBeTruthy(),
		);
		expect(
			(screen.getByLabelText("Quantity (lots)") as HTMLInputElement).value,
		).toBe("0.2");
		fireEvent.click(screen.getByRole("button", { name: "Log Long" }));
		await waitFor(() => expect(createTrade).toHaveBeenCalledOnce());
		expect(vi.mocked(createTrade).mock.calls[0][0].data).toEqual(
			expect.objectContaining({
				portfolioId: 7,
				quantity: "0.2",
				initialStopPrice: "1.095",
				targetPrice: "1.11",
				captureSource: "CALCULATOR",
			}),
		);
	});
	it("displays 0R as a value, legacy risk as unavailable and an open trade separately", () => {
		const plan = calculateInitialRisk(capture);
		const trade = {
			...plan,
			id: 2,
			portfolioId: 7,
			symbol: capture.symbol,
			side: TradeSide.Long,
			status: TradeStatus.Closed,
			entryDate: new Date(capture.entryDate),
			exitDate: new Date("2026-10-01T12:00Z"),
			entryPrice: "1.1",
			exitPrice: "1.11",
			quantity: "0.2",
			netPnl: "0",
			returnPercent: "0",
		};
		const view = setup(<TradeRiskDetails trade={trade} />);
		expect(screen.getByText("0.00R")).toBeTruthy();
		view.rerender(
			<QueryClientProvider client={new QueryClient()}>
				<TradeRiskDetails trade={{ ...trade, status: TradeStatus.Open }} />
			</QueryClientProvider>,
		);
		expect(screen.getByText("Trade is not closed")).toBeTruthy();
		view.rerender(
			<QueryClientProvider client={new QueryClient()}>
				<TradeRiskDetails
					trade={{
						...trade,
						initialRiskAmount: null,
						initialRiskSnapshot: null,
					}}
				/>
			</QueryClientProvider>,
		);
		expect(screen.getByText("No initial stop recorded")).toBeTruthy();
	});
});
