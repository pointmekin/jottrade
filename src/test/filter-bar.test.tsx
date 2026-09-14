// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterBar, type JournalFilters } from "@/components/journal/FilterBar";
import { PeriodPreset } from "@/lib/period";

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: [{ id: 7, name: "Breakout" }] }),
}));

vi.mock("@/server/strategyActions", () => ({
	getStrategies: vi.fn(),
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
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe("FilterBar", () => {
	it("renders a compact, purpose-built toolbar instead of a card surface", () => {
		renderFilterBar();

		const toolbar = screen.getByRole("region", { name: "Journal filters" });
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
		expect(onFiltersChange).toHaveBeenCalledWith({
			side: "SHORT",
			page: 1,
		});
		fireEvent.click(screen.getByRole("button", { name: "High confidence" }));
		expect(onFiltersChange).toHaveBeenLastCalledWith({
			side: "LONG",
			confidence: "HIGH",
			page: 1,
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
			page: 1,
		});

		fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
		expect(onFiltersChange).toHaveBeenLastCalledWith({
			page: 1,
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
		expect(onFiltersChange).toHaveBeenCalledWith({ symbol: "NVDA", page: 1 });
	});
});
