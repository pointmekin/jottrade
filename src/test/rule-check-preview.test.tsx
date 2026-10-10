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
import { CommandPreview } from "@/components/command-palette/command-preview";
import { TradeEntryForm } from "@/components/journal/TradeEntryForm";
import type { WriteIntent } from "@/lib/commands/types";
import {
	RiskRuleKind,
	type RuleContext,
	RuleOutcome,
} from "@/lib/risk-rule-evaluation";
import { DailyLossUnit, RULES_DISCLAIMER } from "@/lib/risk-rules";
import { getRuleContext } from "@/server/riskRuleActions";
import { createTrade } from "@/server/tradeActions";

const state = vi.hoisted(() => ({
	accounts: [{ id: 7, name: "Main account", currency: "USD" }],
	activeAccount: { id: 7, name: "Main account", currency: "USD" },
}));
vi.mock("@/hooks/use-accounts", () => ({ useAccounts: () => state }));
vi.mock("@/hooks/use-account-entries", () => ({}));
vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "u1" } } }) },
}));
vi.mock("@/server/tradeActions", () => ({ createTrade: vi.fn() }));
vi.mock("@/server/cashFlowActions", () => ({ addCashFlow: vi.fn() }));
vi.mock("@/server/strategyActions", () => ({ getStrategies: async () => [] }));
vi.mock("@/server/riskRuleActions", () => ({ getRuleContext: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children }: { to: string; children: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));

const NOW = new Date("2026-10-09T14:00:00Z");

const context: RuleContext = {
	currency: "USD",
	version: {
		version: 3,
		timezone: "America/New_York",
		rules: {
			v: 1,
			maxTradeRiskAmount: "500",
			dailyLoss: { unit: DailyLossUnit.Amount, value: "300" },
			maxTradesPerDay: 3,
			cooldown: { afterLosses: 1, minutes: 30 },
		},
	},
	dayKey: "2026-10-09",
	realizedPnl: -100,
	missingPnlCount: 0,
	enteredCount: 3,
	dayStartBalance: 10000,
	recentClosed: [{ exitDate: "2026-10-09T13:45:00.000Z", netPnl: -100 }],
};

const trade: WriteIntent = {
	type: "trade",
	params: {
		symbol: "EURUSD",
		side: "LONG",
		entryPrice: "1.1",
		quantity: "1",
		initialStopPrice: "1.09",
	},
};

function setup(child: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>{child}</QueryClientProvider>,
	);
}

function fill(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const ruleCheck = () => screen.findByRole("region", { name: "Rule check" });

beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	vi.mocked(getRuleContext).mockResolvedValue(context);
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("rule check preview", () => {
	it("shows the same text in the log form and the command palette", async () => {
		setup(<TradeEntryForm />);
		fill("Symbol", "EURUSD");
		fill("Entry price", "1.1");
		fill("Quantity (lots)", "1");
		fill("Initial stop price", "1.09");
		const manual = (await ruleCheck()).textContent;
		cleanup();

		setup(
			<CommandPreview intent={trade} onBack={vi.fn()} onSuccess={vi.fn()} />,
		);
		const command = (await ruleCheck()).textContent;

		expect(command).toBe(manual);
		expect(manual).toContain("Risk per trade: $1,000.00 of $500.00 · Violated");
		expect(manual).toContain("Loss today: $100.00 of $300.00 · Pass");
		expect(manual).toContain("Trades today: 4 of 3 · Violated");
		expect(manual).toContain(
			"Cooldown: after 1 loss: wait until 10:15 · Violated",
		);
		expect(manual).toContain(
			"Main account · Fri 9 Oct, America/New_York · Rules v3",
		);
		expect(manual).toContain(RULES_DISCLAIMER);
		const calls = vi.mocked(getRuleContext).mock.calls;
		expect(calls[0][0]).toEqual(calls.at(-1)?.[0]);
		expect(calls[0][0]).toEqual({
			data: { portfolioId: 7, entryDate: "2026-10-09T14:00:00.000Z" },
		});
	});

	it("shows Unknown for a missing stop and does not block the log button", async () => {
		setup(<TradeEntryForm />);
		fill("Symbol", "EURUSD");
		fill("Entry price", "1.1");
		fill("Quantity (lots)", "1");

		expect((await ruleCheck()).textContent).toContain(
			"Risk per trade: no initial stop recorded · Unknown",
		);
		expect(
			screen.getByRole<HTMLButtonElement>("button", { name: "Log Long" })
				.disabled,
		).toBe(false);
	});

	it("links to the settings when the account has no rules", async () => {
		vi.mocked(getRuleContext).mockResolvedValue({
			...context,
			version: null,
			dayKey: null,
		});
		setup(<TradeEntryForm />);

		await screen.findByText(/No rules for this account/);
		expect(
			screen.getByRole("link", { name: "Set rules" }).getAttribute("href"),
		).toBe("/settings");
	});

	it("keeps the log button on when the context fails, and retries", async () => {
		vi.mocked(getRuleContext).mockRejectedValueOnce(new Error("Network"));
		setup(<TradeEntryForm />);

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Could not check rules. You can still log the trade.",
		);
		expect(
			screen.getByRole<HTMLButtonElement>("button", { name: "Log Long" })
				.disabled,
		).toBe(false);
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(getRuleContext).toHaveBeenCalledTimes(2));
		await ruleCheck();
	});

	it("shows the note field only when a rule is violated, and sends the note", async () => {
		vi.mocked(createTrade).mockResolvedValue({
			success: true,
			id: 1,
			duplicate: false,
			ruleCheck: null,
		});
		setup(<TradeEntryForm />);
		fill("Symbol", "EURUSD");
		fill("Entry price", "1.1");
		fill("Quantity (lots)", "1");
		fill("Initial stop price", "1.09");
		await ruleCheck();

		fill("Why did you take it? (optional)", "News setup.");
		fireEvent.click(screen.getByRole("button", { name: "Log Long" }));

		await waitFor(() =>
			expect(createTrade).toHaveBeenCalledWith({
				data: expect.objectContaining({ ruleNote: "News setup." }),
			}),
		);
	});

	it("hides the note field when no rule is violated", async () => {
		vi.mocked(getRuleContext).mockResolvedValue({
			...context,
			enteredCount: 0,
			recentClosed: [],
			version: { ...context.version, rules: { v: 1, maxTradesPerDay: 3 } },
		} as RuleContext);
		setup(<TradeEntryForm />);
		fill("Symbol", "EURUSD");

		expect((await ruleCheck()).textContent).toContain("Trades today: 1 of 3");
		expect(
			screen.queryByLabelText("Why did you take it? (optional)"),
		).toBeNull();
	});

	it("shows the stored result when the server result differs from the preview", async () => {
		vi.mocked(createTrade).mockResolvedValue({
			success: true,
			id: 1,
			duplicate: false,
			ruleCheck: {
				v: 1,
				version: 3,
				timezone: "America/New_York",
				dayKey: "2026-10-09",
				evaluatedAt: NOW.toISOString(),
				captureSource: "MANUAL",
				outcomes: [
					{
						kind: RiskRuleKind.DailyTradeCount,
						outcome: RuleOutcome.Violated,
						limit: 3,
						actual: 5,
						reason: null,
						until: null,
					},
				],
				acknowledged: true,
				note: null,
				reason: null,
			},
		});
		setup(<TradeEntryForm />);
		fill("Symbol", "EURUSD");
		fill("Entry price", "1.1");
		fill("Quantity (lots)", "1");
		await ruleCheck();

		fireEvent.click(screen.getByRole("button", { name: "Log Long" }));

		await waitFor(() =>
			expect(toast.warning).toHaveBeenCalledWith(
				"The saved rule check is different from the preview.",
				{ description: "Trades today: 5 of 3 · Violated" },
			),
		);
	});
});
