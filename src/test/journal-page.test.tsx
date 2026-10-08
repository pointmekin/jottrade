// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAccountStore } from "@/lib/account-store";
import { type JournalSearch, journalSearchSchema } from "@/lib/journal-search";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	search: {} as JournalSearch,
	journal: { isLoading: false, totalPages: 2 },
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: object) => ({ options }),
	retainSearchParams: () => vi.fn(),
	useNavigate: () => mocks.navigate,
	useSearch: () => mocks.search,
	Navigate: (props: object) => {
		mocks.navigate(props);
		return null;
	},
}));

vi.mock("@/hooks/use-journal-entries", () => ({
	useJournalEntries: () => ({
		entries: [],
		total: 60,
		closedSummary: { count: 40, netPnl: 12.5 },
		page: 1,
		adjustmentCount: 0,
		filter: undefined,
		...mocks.journal,
	}),
}));

vi.mock("@/components/journal/FilterBar", () => ({
	FilterBar: ({
		onFiltersChange,
	}: {
		onFiltersChange: (filters: object) => void;
	}) => (
		<button type="button" onClick={() => onFiltersChange({ symbol: "SPY" })}>
			Filter SPY
		</button>
	),
}));

const Empty = () => null;
vi.mock("@/components/journal/AccountEntriesPanel", () => ({
	AccountEntriesPanel: Empty,
}));
vi.mock("@/components/journal/bulk-edit-bar", () => ({ BulkEditBar: Empty }));
vi.mock("@/components/journal/export-dialog", () => ({ ExportDialog: Empty }));
vi.mock("@/components/journal/import-dialog", () => ({ ImportDialog: Empty }));
vi.mock("@/components/journal/log-trade-drawer", () => ({
	LogTradeDrawer: Empty,
}));
vi.mock("@/components/journal/JournalTable", () => ({
	JournalTable: Empty,
	JournalTableSkeleton: Empty,
}));
vi.mock("@/components/app-page-header", () => ({
	AppPageHeader: ({ meta }: { meta: ReactNode }) => <p>{meta}</p>,
}));
vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));
vi.mock("@/hooks/use-onboarding", () => ({
	useIsJournalFirstRun: () => false,
}));
vi.mock("@/hooks/use-trade-selection", () => ({
	useTradeSelection: () => ({ selectedIds: new Set() }),
}));

const { Route } = await import("@/routes/_authenticated/journal");
const JournalPage = (
	Route as unknown as { options: { component: () => ReactNode } }
).options.component;

function renderJournal(search: Record<string, unknown> = {}) {
	mocks.search = journalSearchSchema.parse(search);
	return render(<JournalPage />);
}

afterEach(() => {
	vi.clearAllMocks();
	mocks.journal = { isLoading: false, totalPages: 2 };
});

describe("journal page", () => {
	it("shows the closed count and net P&L of the scope", () => {
		const view = renderJournal();
		expect(view.getByText(/40 closed · net P&L \+\$12\.50/)).toBeTruthy();
	});

	it("goes to page 1 when a filter changes", () => {
		const view = renderJournal({ page: 2 });
		fireEvent.click(view.getByRole("button", { name: "Filter SPY" }));
		expect(mocks.navigate).toHaveBeenCalledWith({
			search: expect.objectContaining({ symbol: "SPY", page: 1 }),
		});
	});

	it("goes to page 1 when the account changes", () => {
		renderJournal({ page: 2 });
		act(() => useAccountStore.getState().setActiveAccount("user-1", 2));

		const [{ search, replace }] = mocks.navigate.mock.calls.at(-1) ?? [];
		expect(replace).toBe(true);
		expect(search({ page: 2, symbol: "SPY" })).toEqual({
			page: 1,
			symbol: "SPY",
		});
	});

	it("replaces a page above the last page with the last page", () => {
		renderJournal({ page: 99, symbol: "SPY" });
		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "/journal",
				search: expect.objectContaining({ page: 2, symbol: "SPY" }),
				replace: true,
			}),
		);
	});

	it("keeps a page that exists", () => {
		renderJournal({ page: 2 });
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
