// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TradePlaybookCheck } from "@/components/journal/trade-playbook-check";
import { PlaybookCriterionKind } from "@/lib/playbook";
import { buildPlaybookCheck, CriterionResult } from "@/lib/playbook-check";
import {
	getPlaybookCheck,
	savePlaybookCheck,
} from "@/server/playbookCheckActions";

vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({ activeAccount: { id: 7 } }),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "u1" } } }) },
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock("@/server/playbookCheckActions", () => ({
	getPlaybookCheck: vi.fn(),
	savePlaybookCheck: vi.fn(),
}));

const mockGet = vi.mocked(getPlaybookCheck);
const mockSave = vi.mocked(savePlaybookCheck);

const strategy = {
	id: 1,
	name: "Breakout",
	riskGuidance: "Risk 1% or less.",
	criteriaVersion: 2,
	criteria: [
		{
			id: "close",
			kind: PlaybookCriterionKind.Entry,
			text: "Price closes above the range high.",
			required: true,
		},
		{
			id: "volume",
			kind: PlaybookCriterionKind.Entry,
			text: "Volume is above average.",
			required: false,
		},
	],
};
type Loaded = Awaited<ReturnType<typeof getPlaybookCheck>>;
const loaded = (overrides: Partial<Loaded>): Loaded => ({
	revision: 3,
	initialRiskPercent: "0.8",
	strategy,
	check: null,
	isStale: false,
	...overrides,
});
const savedCheck = buildPlaybookCheck(
	strategy,
	{ close: CriterionResult.Followed, volume: CriterionResult.Broke },
	new Date("2026-10-01T08:00:00Z"),
);

function renderWith(data: Loaded) {
	mockGet.mockResolvedValue(data);
	render(
		<QueryClientProvider client={new QueryClient()}>
			<TradePlaybookCheck tradeId={11} />
		</QueryClientProvider>,
	);
}

describe("TradePlaybookCheck", () => {
	afterEach(() => {
		cleanup();
		mockGet.mockReset();
		mockSave.mockReset();
	});

	it("asks for a strategy when the trade has none", async () => {
		renderWith(loaded({ strategy: null }));

		expect(
			await screen.findByText(
				"Assign a strategy to check this trade against its playbook.",
			),
		).toBeTruthy();
	});

	it("links to the strategies page when the playbook has no criteria", async () => {
		renderWith(loaded({ strategy: { ...strategy, criteria: [] } }));

		expect(
			await screen.findByText("This playbook has no criteria yet."),
		).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "Add criteria" }).getAttribute("href"),
		).toBe("/strategies");
	});

	it("saves only the answers, after every required criterion has one", async () => {
		mockSave.mockResolvedValue({ revision: 4, check: savedCheck });
		renderWith(loaded({}));

		const save = await screen.findByRole("button", { name: "Save check" });
		expect(screen.getByText("Risk 1% or less.")).toBeTruthy();
		expect(screen.getByText("Recorded initial risk: 0.80%")).toBeTruthy();
		expect(save.hasAttribute("disabled")).toBe(true);
		fireEvent.click(
			within(
				screen.getByRole("radiogroup", {
					name: "Price closes above the range high.",
				}),
			).getByRole("radio", { name: "Followed" }),
		);
		fireEvent.click(save);

		await vi.waitFor(() => expect(mockSave).toHaveBeenCalled());
		expect(mockSave).toHaveBeenCalledWith({
			data: {
				portfolioId: 7,
				id: 11,
				expectedRevision: 3,
				criteriaVersion: 2,
				results: { close: CriterionResult.Followed },
			},
		});
	});

	it("shows the saved result, the score and the snapshot text", async () => {
		renderWith(loaded({ check: savedCheck }));

		expect(await screen.findByText("Followed plan")).toBeTruthy();
		expect(screen.getByText(/1 of 2 followed/)).toBeTruthy();
		expect(screen.getByText("Volume is above average.")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
	});

	it("keeps the old text and shows the stale notice after a playbook edit", async () => {
		renderWith(
			loaded({
				check: savedCheck,
				isStale: true,
				strategy: {
					...strategy,
					criteriaVersion: 3,
					criteria: [{ ...strategy.criteria[0], text: "New rule." }],
				},
			}),
		);

		expect(
			await screen.findByText(
				"Checked against Breakout v2. The playbook is now v3.",
			),
		).toBeTruthy();
		expect(screen.getByText("Price closes above the range high.")).toBeTruthy();
		expect(screen.queryByText("New rule.")).toBeNull();
	});

	it("shows a conflict from the server", async () => {
		mockSave.mockRejectedValue(new Error("This trade changed. Reload."));
		renderWith(loaded({}));

		fireEvent.click(
			within(
				await screen.findByRole("radiogroup", {
					name: "Price closes above the range high.",
				}),
			).getByRole("radio", { name: "Broke" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Save check" }));

		expect((await screen.findByRole("alert")).textContent).toContain(
			"This trade changed. Reload.",
		);
	});

	it("offers a retry when the check does not load", async () => {
		mockGet.mockRejectedValue(new Error("offline"));
		render(
			<QueryClientProvider
				client={
					new QueryClient({ defaultOptions: { queries: { retry: false } } })
				}
			>
				<TradePlaybookCheck tradeId={11} />
			</QueryClientProvider>,
		);

		expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
	});
});
