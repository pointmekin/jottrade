// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RulesComplianceSection } from "@/components/dashboard/rules-compliance-section";
import { RulesTodayCard } from "@/components/dashboard/rules-today-card";
import {
	ComplianceUnit,
	type RuleToday,
	type RuleViolation,
} from "@/lib/risk-rule-compliance";
import { RiskRuleKind, RuleOutcome } from "@/lib/risk-rule-evaluation";
import { RULES_DISCLAIMER } from "@/lib/risk-rules";
import {
	getRuleCompliance,
	getRuleToday,
	type RuleComplianceResult,
} from "@/server/riskRuleActions";

const account = { id: 7, name: "Prop Challenge", currency: "USD" };
vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({ accounts: [account], activeAccount: account }),
}));
vi.mock("@/server/riskRuleActions", () => ({
	getRuleToday: vi.fn(),
	getRuleCompliance: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		params,
		search,
		children,
		className,
	}: {
		to: string;
		params?: { tradeId: string };
		search?: Record<string, string>;
		children: ReactNode;
		className?: string;
	}) => {
		const path = params ? to.replace("$tradeId", params.tradeId) : to;
		const query = search ? `?${new URLSearchParams(search)}` : "";
		return (
			<a href={`${path}${query}`} className={className}>
				{children}
			</a>
		);
	},
}));

const SCOPE = { portfolioId: 7, timeZone: "UTC" };

function setup(child: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>{child}</QueryClientProvider>,
	);
}

const loss = {
	kind: RiskRuleKind.DailyLoss,
	outcome: RuleOutcome.Pass,
	limit: 500,
	actual: 320,
	reason: null,
	until: null,
};

const today: RuleToday = {
	version: 3,
	timezone: "America/New_York",
	dayKey: "2026-10-09",
	dailyLoss: loss,
	trades: { limit: 3, entered: 2 },
	cooldown: {
		kind: RiskRuleKind.Cooldown,
		outcome: RuleOutcome.Violated,
		limit: 30,
		actual: 1,
		reason: null,
		until: "2026-10-09T18:35:00.000Z",
	},
	openRisk: { amount: 80, count: 1, unknownCount: 2 },
};

const violation = (patch: Partial<RuleViolation>): RuleViolation => ({
	kind: RiskRuleKind.DailyTradeCount,
	at: "2026-10-09T15:00:00.000Z",
	dayKey: "2026-10-09",
	tradeId: null,
	version: 2,
	limit: 3,
	actual: 4,
	sourceTradeIds: [41],
	imported: false,
	...patch,
});

const compliance = (
	patch: Partial<RuleComplianceResult> = {},
): RuleComplianceResult => ({
	tallies: [
		{
			kind: RiskRuleKind.DailyTradeCount,
			unit: ComplianceUnit.Day,
			pass: 17,
			violated: 1,
			unknown: 0,
		},
		{
			kind: RiskRuleKind.TradeRiskAmount,
			unit: ComplianceUnit.Trade,
			pass: 4,
			violated: 0,
			unknown: 3,
		},
	],
	violations: [violation({})],
	versions: [1, 2],
	timezones: ["America/New_York"],
	scopeIgnored: false,
	...patch,
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("RulesTodayCard", () => {
	it("shows the allowance left with the account, the day and the version", async () => {
		vi.mocked(getRuleToday).mockResolvedValue(today);
		setup(<RulesTodayCard />);

		const card = await screen.findByRole("region", { name: "Rules today" });
		const text = card.textContent;
		expect(text).toContain(
			"Prop Challenge · Fri 9 Oct, America/New_York · Rules v3",
		);
		expect(text).toContain("Loss left today$180.00 of $500.00Realized only.");
		expect(text).toContain("Trades left1 of 3");
		expect(text).toContain("CooldownUntil 14:35");
		expect(text).toContain("2 open trades with unknown risk");
		expect(within(card).getByRole("note").textContent).toBe(RULES_DISCLAIMER);
		expect(getRuleToday).toHaveBeenCalledWith({ data: { portfolioId: 7 } });
	});

	it("shows Unknown, not an allowance, when a closed trade has no P&L", async () => {
		vi.mocked(getRuleToday).mockResolvedValue({
			...today,
			dailyLoss: {
				...loss,
				outcome: RuleOutcome.Unknown,
				reason: "1 closed trade today has no P&L",
			},
		});
		setup(<RulesTodayCard />);

		const card = await screen.findByRole("region", { name: "Rules today" });
		expect(card.textContent).toContain(
			"Loss left todayUnknown1 closed trade today has no P&L. Realized only.",
		);
	});

	it("shows a Set rules link with no rules", async () => {
		vi.mocked(getRuleToday).mockResolvedValue(null);
		setup(<RulesTodayCard />);

		const link = await screen.findByRole("link", { name: "Set rules" });
		expect(link.getAttribute("href")).toBe("/settings");
		expect(screen.queryByRole("note")).toBeNull();
	});

	it("shows an error with Retry", async () => {
		vi.mocked(getRuleToday).mockRejectedValueOnce(new Error("down"));
		setup(<RulesTodayCard />);

		await screen.findByText("Could not load the rules.");
		vi.mocked(getRuleToday).mockResolvedValue(today);
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(
			await screen.findByRole("region", { name: "Rules today" }),
		).toBeTruthy();
	});
});

describe("RulesComplianceSection", () => {
	const renderSection = () =>
		setup(<RulesComplianceSection scope={SCOPE} periodLabel="This month" />);

	it("counts Unknown apart from Pass and links each violation to its trades", async () => {
		vi.mocked(getRuleCompliance).mockResolvedValue(
			compliance({
				violations: [
					violation({
						kind: RiskRuleKind.DailyLoss,
						limit: 500,
						actual: 550,
						sourceTradeIds: [51, 52],
						imported: true,
					}),
					violation({}),
				],
			}),
		);
		renderSection();

		const section = await screen.findByRole("region", {
			name: "Rule compliance",
		});
		expect(section.textContent).toContain(
			"Trades per day: 18 days checked · 17 pass · 1 violated · 0 unknown",
		);
		expect(section.textContent).toContain(
			"Risk per trade: 7 trades checked · 4 pass · 0 violated · 3 unknown",
		);
		const [daily, count] = within(
			screen.getByRole("list", { name: "Rule violations" }),
		).getAllByRole("listitem");
		expect(daily.textContent).toContain("Daily loss: $550.00 of $500.00");
		expect(within(daily).getByText("Imported")).toBeTruthy();
		expect(
			within(daily)
				.getAllByRole("link")
				.map((link) => link.getAttribute("href")),
		).toEqual([
			"/journal/51",
			"/journal/52",
			"/journal?status=CLOSED&period=custom&dateFrom=2026-10-09&dateTo=2026-10-09",
		]);
		expect(count.textContent).toContain("Trades per day: 4 of 3");
		expect(count.textContent).toContain("Fri 9 Oct · Rules v2");
		expect(within(count).getByRole("link").getAttribute("href")).toBe(
			"/journal/41",
		);
		expect(section.textContent).toContain(
			"Prop Challenge · America/New_York · v1, v2",
		);
		expect(within(section).getByRole("note").textContent).toBe(
			RULES_DISCLAIMER,
		);
	});

	it("shows 20 violations, then more on Show more", async () => {
		vi.mocked(getRuleCompliance).mockResolvedValue(
			compliance({
				violations: Array.from({ length: 25 }, (_, index) =>
					violation({
						kind: RiskRuleKind.TradeRiskAmount,
						tradeId: index + 1,
						sourceTradeIds: [index + 1],
					}),
				),
			}),
		);
		renderSection();

		const list = await screen.findByRole("list", { name: "Rule violations" });
		expect(within(list).getAllByRole("listitem")).toHaveLength(20);
		fireEvent.click(screen.getByRole("button", { name: "Show more" }));
		expect(within(list).getAllByRole("listitem")).toHaveLength(25);
		expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
	});

	it("shows the empty and the scope notices", async () => {
		vi.mocked(getRuleCompliance).mockResolvedValue(
			compliance({ violations: [], scopeIgnored: true }),
		);
		renderSection();

		expect(
			await screen.findByText("No violations in this period."),
		).toBeTruthy();
		expect(
			screen.getByText("Rules use the account and the period only."),
		).toBeTruthy();
	});

	it("shows nothing with no rules", async () => {
		vi.mocked(getRuleCompliance).mockResolvedValue(null);
		const { container } = renderSection();

		await vi.waitFor(() => expect(getRuleCompliance).toHaveBeenCalled());
		await vi.waitFor(() => expect(container.innerHTML).toBe(""));
	});
});
