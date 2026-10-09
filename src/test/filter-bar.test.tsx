// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterBar, type JournalFilters } from "@/components/journal/FilterBar";
import { SymbolMatch } from "@/lib/analysis-scope";
import { CLEARED_TRADE_FILTERS } from "@/lib/journal-search";
import { PeriodPreset } from "@/lib/period";

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: [{ id: 7, name: "Breakout" }] }),
}));

vi.mock("@/server/strategyActions", () => ({
	getStrategies: vi.fn(),
}));

vi.mock("@/hooks/use-tags", () => ({
	useTags: () => ({
		data: [
			{ id: 3, name: "FOMO", color: "gray" },
			{ id: 4, name: "News", color: "blue" },
		],
	}),
	useCreateTag: () => ({ mutate: vi.fn(), reset: vi.fn() }),
}));

vi.mock("@/components/journal/saved-views-menu", () => ({
	SavedViewsMenu: () => null,
}));

const appliedView = vi.hoisted(() => ({
	current: {
		view: undefined as { name: string } | undefined,
		isModified: false,
	},
}));

vi.mock("@/hooks/use-saved-views", () => ({
	useAppliedView: () => appliedView.current,
}));

vi.mock("@/components/period-picker", () => ({
	PeriodPicker: ({ onChange }: { onChange: (value: unknown) => void }) => (
		<button
			type="button"
			onClick={() => onChange({ preset: PeriodPreset.Last7Days })}
		>
			Reporting period
		</button>
	),
}));

function renderFilterBar(filters: JournalFilters = {}) {
	const onFiltersChange = vi.fn();
	const view = render(
		<FilterBar filters={filters} onFiltersChange={onFiltersChange} />,
	);
	return { ...view, onFiltersChange };
}

afterEach(() => {
	appliedView.current = { view: undefined, isModified: false };
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe("FilterBar", () => {
	it("renders a compact, purpose-built toolbar instead of a card surface", () => {
		renderFilterBar();

		const toolbar = screen.getByRole("region", { name: "Filters" });
		expect(toolbar.className).toContain("border-y");
		expect(toolbar.className).not.toContain("surface");
		expect(
			screen
				.getByRole("button", { name: "Filters" })
				.getAttribute("aria-expanded"),
		).toBe("false");
		expect(screen.queryByRole("textbox", { name: "Symbol" })).toBeNull();
	});

	it("expands the filter fields and preserves toggle updates", () => {
		const { onFiltersChange } = renderFilterBar({ side: "LONG" });

		fireEvent.click(screen.getByRole("button", { name: /Filters/ }));

		expect(
			screen
				.getByRole("button", { name: /Filters/ })
				.getAttribute("aria-expanded"),
		).toBe("true");
		expect(screen.getByRole("textbox", { name: "Symbol" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "SHORT" }));
		expect(onFiltersChange).toHaveBeenCalledWith({ side: "SHORT" });
		fireEvent.click(screen.getByRole("button", { name: "High confidence" }));
		expect(onFiltersChange).toHaveBeenLastCalledWith({
			side: "LONG",
			confidence: "HIGH",
		});
	});

	it("keeps period and clear-all changes URL-ready", () => {
		const { onFiltersChange } = renderFilterBar({
			symbol: "AAPL",
			status: "OPEN",
			period: PeriodPreset.ThisMonth,
		});

		expect(screen.getByText("2")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Reporting period" }));
		expect(onFiltersChange).toHaveBeenCalledWith({
			symbol: "AAPL",
			status: "OPEN",
			period: PeriodPreset.Last7Days,
			dateFrom: undefined,
			dateTo: undefined,
		});

		fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
		expect(onFiltersChange).toHaveBeenLastCalledWith({
			...CLEARED_TRADE_FILTERS,
			period: PeriodPreset.ThisMonth,
		});
	});

	it("debounces symbol changes", () => {
		vi.useFakeTimers();
		const { onFiltersChange } = renderFilterBar();
		fireEvent.click(screen.getByRole("button", { name: "Filters" }));

		fireEvent.change(screen.getByRole("textbox", { name: "Symbol" }), {
			target: { value: "NVDA" },
		});
		expect(onFiltersChange).not.toHaveBeenCalled();

		act(() => vi.advanceTimersByTime(300));
		expect(onFiltersChange).toHaveBeenCalledWith({ symbol: "NVDA" });
	});

	it("drops a pending symbol when the user clears all filters", () => {
		vi.useFakeTimers();
		const { onFiltersChange } = renderFilterBar({ side: "LONG" });
		fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
		const input = screen.getByRole("textbox", { name: "Symbol" });

		fireEvent.change(input, { target: { value: "NVDA" } });
		fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
		act(() => vi.advanceTimersByTime(300));

		expect((input as HTMLInputElement).value).toBe("");
		expect(onFiltersChange).toHaveBeenCalledTimes(1);
		expect(onFiltersChange).toHaveBeenCalledWith({
			...CLEARED_TRADE_FILTERS,
			side: undefined,
		});
	});

	it("shows the tag filter with its match mode and switches to every tag", () => {
		const { onFiltersChange } = renderFilterBar({ tags: "3,4" });

		expect(screen.getByText("Tags, any of: FOMO, News")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
		expect(screen.getByRole("button", { name: /2 selected/ })).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", { name: "Match every selected tag" }),
		);
		expect(onFiltersChange).toHaveBeenCalledWith({
			tags: "3,4",
			tagMatch: "all",
		});
		fireEvent.click(screen.getByRole("button", { name: "Clear tag filter" }));
		expect(onFiltersChange).toHaveBeenLastCalledWith({
			tags: undefined,
			tagMatch: undefined,
		});
	});

	it("shows a chip for every active filter", () => {
		renderFilterBar({
			period: PeriodPreset.ThisMonth,
			symbol: "SPY",
			side: "LONG",
			status: "CLOSED",
			setupId: "7",
			confidence: "HIGH,LOW",
			mistake: "FOMO",
			tags: "3",
		});

		for (const chip of [
			"Closed in: This month",
			"Symbol: SPY",
			"LONG",
			"CLOSED",
			"Strategy: Breakout",
			"Confidence: HIGH, LOW",
			"Mistake: FOMO",
			"Tags, any of: FOMO",
		])
			expect(screen.getByText(chip)).toBeTruthy();
		for (const field of ["strategy", "confidence", "mistake"])
			expect(
				screen.getByRole("button", { name: `Clear ${field} filter` }),
			).toBeTruthy();
	});

	it("says closed or opened when the status is not closed", () => {
		renderFilterBar({ period: PeriodPreset.ThisMonth, setupId: "none" });

		expect(screen.getByText("Closed or opened in: This month")).toBeTruthy();
		expect(screen.getByText("Strategy: None")).toBeTruthy();
	});

	it("shows an exact symbol from a chart and drops the exact match when the user types", () => {
		vi.useFakeTimers();
		const { onFiltersChange } = renderFilterBar({
			symbol: "EURUSD",
			symbolMatch: SymbolMatch.Exact,
		});
		expect(screen.getByText("Symbol is EURUSD")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
		fireEvent.change(screen.getByRole("textbox", { name: "Symbol" }), {
			target: { value: "EUR" },
		});
		act(() => vi.advanceTimersByTime(300));
		expect(onFiltersChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ symbol: "EUR", symbolMatch: undefined }),
		);
	});

	it("clears the symbol input when the URL symbol is cleared", () => {
		vi.useFakeTimers();
		const { onFiltersChange, rerender } = renderFilterBar({ symbol: "SPY" });
		fireEvent.click(screen.getByRole("button", { name: /Filters/ }));

		rerender(<FilterBar filters={{}} onFiltersChange={onFiltersChange} />);
		act(() => vi.advanceTimersByTime(300));

		expect(
			(screen.getByRole("textbox", { name: "Symbol" }) as HTMLInputElement)
				.value,
		).toBe("");
		expect(onFiltersChange).not.toHaveBeenCalled();
	});

	it("shows the applied view, marks a changed scope and closes the view only", () => {
		appliedView.current = { view: { name: "Feb SPY" }, isModified: true };
		const { onFiltersChange } = renderFilterBar({
			symbol: "SPY",
			savedView: 2,
		});

		expect(screen.getByText("View: Feb SPY")).toBeTruthy();
		expect(screen.getByText("· Modified")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Close saved view" }));
		expect(onFiltersChange).toHaveBeenCalledWith({
			symbol: "SPY",
			savedView: undefined,
		});
	});

	it("shows no chip row for a saved view id that does not resolve", () => {
		renderFilterBar({ savedView: 99 });

		expect(
			screen.getByRole("region", { name: "Filters" }).children,
		).toHaveLength(1);
	});
});
