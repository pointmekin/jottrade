// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewEditor } from "@/components/reviews/review-editor";
import {
	EMPTY_REVIEW_FIELDS,
	ReviewKind,
	ReviewStatus,
	summarizeReview,
} from "@/lib/review";
import { ComplianceUnit, type RuleViolation } from "@/lib/risk-rule-compliance";
import { RiskRuleKind } from "@/lib/risk-rule-evaluation";
import {
	getRuleCompliance,
	type RuleComplianceResult,
} from "@/server/riskRuleActions";

vi.mock("@tanstack/react-query", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-query")>()),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useMutation: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		params,
		search,
		hash,
		children,
	}: {
		to: string;
		params?: { tradeId: string };
		search?: Record<string, string>;
		hash?: string;
		children: ReactNode;
	}) => {
		const path = params ? to.replace("$tradeId", params.tradeId) : to;
		const query = search ? `?${new URLSearchParams(search)}` : "";
		const fragment = hash ? `#${hash}` : "";
		return <a href={`${path}${query}${fragment}`}>{children}</a>;
	},
}));
vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({ activeAccount: { id: 1, currency: "USD" } }),
}));
vi.mock("@/server/riskRuleActions", () => ({ getRuleCompliance: vi.fn() }));
vi.mock("@/server/reviewActions", () => ({
	getReviewPeriod: vi.fn(),
	saveReviewPeriod: vi.fn(),
	reopenReviewPeriod: vi.fn(),
}));
vi.mock("@/server/importActions", () => ({ getImportBatch: vi.fn() }));
vi.mock("@/hooks/use-review-autosave", () => ({
	useReviewAutosave: () => ({
		fields: { ...EMPTY_REVIEW_FIELDS, notes: "Pending local draft" },
		revision: 1,
		status: "conflict",
		serverFields: EMPTY_REVIEW_FIELDS,
		error: null,
		edit: vi.fn(),
		flush: vi.fn(),
		reload: vi.fn(),
		resolve: vi.fn(),
	}),
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderEditor(
	review: ComponentProps<typeof ReviewEditor>["review"],
	kind: ReviewKind = ReviewKind.Daily,
) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<ReviewEditor review={review} userId="u1" portfolioId={1} kind={kind} />
		</QueryClientProvider>,
	);
}

it("shows completed saved text while retaining a conflicting local draft for recovery", () => {
	const fields = { ...EMPTY_REVIEW_FIELDS, notes: "Frozen completed notes" };
	const review = {
		fields,
		revision: 2,
		currency: "USD",
		liveCurrency: "USD",
		importChanges: [],
		previousCommitment: null,
		window: {
			periodStart: "2026-10-02",
			periodEndExclusive: "2026-10-03",
			timezoneSnapshot: "UTC",
		},
		period: {
			status: ReviewStatus.Complete,
			id: 1,
			resultSnapshot: summarizeReview([], []),
		},
		sources: { trades: [], flows: [], results: summarizeReview([], []) },
		tradeLinks: [],
		flowLinks: [],
	} as unknown as ComponentProps<typeof ReviewEditor>["review"];
	vi.mocked(getRuleCompliance).mockResolvedValue(null);
	renderEditor(review);
	expect(
		(screen.getByLabelText("Day / period notes") as HTMLTextAreaElement).value,
	).toBe("Frozen completed notes");
	expect(screen.getByRole("alert").textContent).toContain(
		"pending draft is kept",
	);
	expect(screen.getByRole("button", { name: "Copy review text" })).toBeTruthy();
});

const openReview = (window: {
	periodStart: string;
	periodEndExclusive: string;
}) =>
	({
		fields: EMPTY_REVIEW_FIELDS,
		revision: 1,
		currency: "USD",
		liveCurrency: "USD",
		importChanges: [],
		previousCommitment: null,
		window: { ...window, timezoneSnapshot: "America/New_York" },
		period: null,
		sources: { trades: [], flows: [], results: summarizeReview([], []) },
		tradeLinks: [],
		flowLinks: [],
	}) as unknown as ComponentProps<typeof ReviewEditor>["review"];

const DAY = { periodStart: "2026-10-09", periodEndExclusive: "2026-10-10" };
const WEEK = { periodStart: "2026-10-05", periodEndExclusive: "2026-10-12" };

const violation = (patch: Partial<RuleViolation>): RuleViolation => ({
	kind: RiskRuleKind.DailyTradeCount,
	at: "2026-10-09T15:00:00.000Z",
	dayKey: "2026-10-09",
	tradeId: null,
	version: 1,
	timezone: "America/New_York",
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
			pass: 0,
			violated: 1,
			unknown: 0,
		},
		{
			kind: RiskRuleKind.TradeRiskAmount,
			unit: ComplianceUnit.Trade,
			pass: 3,
			violated: 1,
			unknown: 0,
		},
	],
	violations: [
		violation({}),
		violation({
			kind: RiskRuleKind.TradeRiskAmount,
			tradeId: 42,
			limit: 100,
			actual: 150,
			sourceTradeIds: [42],
		}),
	],
	versions: [1],
	timezones: ["America/New_York"],
	scopeIgnored: false,
	...patch,
});

describe("rule violations in the review", () => {
	const section = () =>
		screen.findByRole("region", { name: "Rule violations" });

	it("lists the violations of the review day with links to the source trades", async () => {
		vi.mocked(getRuleCompliance).mockResolvedValue(compliance());
		renderEditor(openReview(DAY));

		const found = await section();
		expect(found.textContent).toContain("Rule violations this day (2)");
		expect(found.textContent).toContain("Trades per day: 4 of 3");
		expect(found.textContent).toContain("Risk per trade: $150.00 of $100.00");
		expect(
			within(found)
				.getAllByRole("link")
				.map((link) => link.getAttribute("href")),
		).toEqual(["/journal/41", "/journal/42"]);
		expect(getRuleCompliance).toHaveBeenCalledWith({
			data: {
				portfolioId: 1,
				timeZone: "America/New_York",
				dateFrom: "2026-10-09T04:00:00.000Z",
				dateTo: "2026-10-10T03:59:59.999Z",
			},
		});
	});

	it("says No violations for a clean day", async () => {
		vi.mocked(getRuleCompliance).mockResolvedValue(
			compliance({ violations: [] }),
		);
		renderEditor(openReview(DAY));

		expect((await section()).textContent).toContain(
			"Rule violations this day (0)No violations.",
		);
	});

	it("is hidden with no rules", async () => {
		vi.mocked(getRuleCompliance).mockResolvedValue(null);
		renderEditor(openReview(DAY));

		await waitFor(() => expect(getRuleCompliance).toHaveBeenCalled());
		await waitFor(() =>
			expect(
				screen.queryByRole("region", { name: "Rule violations" }),
			).toBeNull(),
		);
		expect(screen.queryByText(/Rule violations/)).toBeNull();
	});

	it("counts each rule in the weekly review and links the dashboard week", async () => {
		vi.mocked(getRuleCompliance).mockResolvedValue(compliance());
		renderEditor(openReview(WEEK), ReviewKind.Weekly);

		const found = await section();
		expect(found.textContent).toContain("Rule violations this week (2)");
		expect(found.textContent).toContain("Trades per day: 1 violated");
		expect(found.textContent).toContain("Risk per trade: 1 violated");
		expect(
			within(found)
				.getByRole("link", { name: "Open the week in the dashboard" })
				.getAttribute("href"),
		).toBe(
			"/dashboard?period=custom&dateFrom=2026-10-05T04%3A00%3A00.000Z&dateTo=2026-10-12T03%3A59%3A59.999Z#rule-compliance",
		);
	});
});
