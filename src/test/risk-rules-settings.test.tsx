// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyLossUnit, RULES_DISCLAIMER } from "@/lib/risk-rules";

const mocks = vi.hoisted(() => ({
	getRiskRules: vi.fn(),
	saveRiskRules: vi.fn(),
	clearRiskRules: vi.fn(),
}));

vi.mock("@/server/riskRuleActions", () => mocks);
vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "alice" } } }) },
}));
vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({
		activeAccount: { id: 2, name: "Prop Challenge", currency: "USD" },
	}),
}));

const { RiskRulesSettings } = await import(
	"@/components/settings/risk-rules-settings"
);

const NEW_YORK = "America/New_York";
const VERSION_3 = {
	version: 3,
	rules: {
		v: 1,
		maxTradeRiskAmount: "250",
		dailyLoss: { unit: DailyLossUnit.BalancePercent, value: "2" },
		maxTradesPerDay: 3,
		cooldown: { afterLosses: 2, minutes: 30 },
	},
	timezone: NEW_YORK,
	effectiveFrom: new Date("2026-10-09T18:05:00Z"),
};

function renderRules(state: object) {
	mocks.getRiskRules.mockResolvedValue({ reviewTimezone: NEW_YORK, ...state });
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<RiskRulesSettings />
		</QueryClientProvider>,
	);
	return client;
}

const field = (label: RegExp) => screen.getByLabelText(label);
const type = (label: RegExp, value: string) =>
	fireEvent.change(field(label), { target: { value } });

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("RiskRulesSettings", () => {
	it("asks for the review timezone first", async () => {
		renderRules({ current: null, reviewTimezone: null });
		expect(
			await screen.findByText(/Choose your review timezone first\./),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Save rules" })).toBeNull();
	});

	it("shows the empty state and the disclaimer", async () => {
		renderRules({ current: null });
		expect(
			await screen.findByText(
				"Set the limits you want to check. Each one is optional.",
			),
		).toBeTruthy();
		expect(screen.getByRole("note").textContent).toBe(RULES_DISCLAIMER);
		expect(screen.queryByText(/^Version/)).toBeNull();
		expect(screen.queryByRole("button", { name: "Clear rules" })).toBeNull();
	});

	it("shows the version, the effective time and the timezone", async () => {
		renderRules({ current: VERSION_3 });
		expect(
			await screen.findByText(
				"Version 3 · since 9 Oct 2026, 14:05 · days end at midnight America/New_York",
			),
		).toBeTruthy();
		expect(
			(field(/Max risk per trade \(USD\)/) as HTMLInputElement).value,
		).toBe("250");
		expect((field(/Max trades per day/) as HTMLInputElement).value).toBe("3");
		expect(screen.queryByText(/Your review timezone is now/)).toBeNull();
	});

	it("tells when the review timezone changed after the save", async () => {
		renderRules({ current: VERSION_3, reviewTimezone: "UTC" });
		expect(
			await screen.findByText(
				"Rules use America/New_York. Your review timezone is now UTC. Save the rules to use it.",
			),
		).toBeTruthy();
	});

	it("saves the filled limits and reports a new version", async () => {
		mocks.saveRiskRules.mockResolvedValue({ saved: true });
		renderRules({ current: null });
		await screen.findByRole("button", { name: "Save rules" });
		type(/Max risk per trade \(%/, "1");
		type(/Daily loss limit/, "500");
		type(/Wait \(minutes\)/, "15");
		fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
		expect(await screen.findByText("Rules saved.")).toBeTruthy();
		expect(mocks.saveRiskRules).toHaveBeenCalledWith({
			data: {
				portfolioId: 2,
				rules: {
					maxTradeRiskPercent: "1",
					dailyLoss: { unit: DailyLossUnit.Amount, value: "500" },
					cooldown: { afterLosses: 1, minutes: 15 },
				},
			},
		});
	});

	it("reports a save with no change", async () => {
		mocks.saveRiskRules.mockResolvedValue({ saved: false });
		renderRules({ current: VERSION_3 });
		fireEvent.click(await screen.findByRole("button", { name: "Save rules" }));
		expect(
			await screen.findByText("No change. Nothing was saved."),
		).toBeTruthy();
	});

	it("does not send an empty set", async () => {
		renderRules({ current: null });
		fireEvent.click(await screen.findByRole("button", { name: "Save rules" }));
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Set one or more limits, or clear the rules.",
		);
		expect(mocks.saveRiskRules).not.toHaveBeenCalled();
	});

	it("shows the server error", async () => {
		mocks.saveRiskRules.mockRejectedValue(new Error("Account not found."));
		renderRules({ current: VERSION_3 });
		fireEvent.click(await screen.findByRole("button", { name: "Save rules" }));
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Account not found.",
		);
	});

	it.each([
		["Save rules", mocks.saveRiskRules],
		["Clear rules", mocks.clearRiskRules],
	])(
		"refreshes the rules and the entry preview after %s",
		async (name, action) => {
			action.mockResolvedValue({ saved: true });
			const client = renderRules({ current: VERSION_3 });
			const invalidate = vi.spyOn(client, "invalidateQueries");
			fireEvent.click(await screen.findByRole("button", { name }));
			await waitFor(() =>
				expect(
					invalidate.mock.calls.map(([filters]) => filters?.queryKey),
				).toEqual([["risk-rules"], ["rule-context"]]),
			);
		},
	);

	it("clears the rules", async () => {
		mocks.clearRiskRules.mockResolvedValue({ saved: true });
		renderRules({ current: VERSION_3 });
		fireEvent.click(await screen.findByRole("button", { name: "Clear rules" }));
		await waitFor(() =>
			expect(mocks.clearRiskRules).toHaveBeenCalledWith({
				data: { portfolioId: 2 },
			}),
		);
	});
});
