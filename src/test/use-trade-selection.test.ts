// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TradeFilter } from "@/db/trade-filter";
import { useTradeSelection } from "@/hooks/use-trade-selection";

vi.mock("@/server/getTrades", () => ({ getTradeIds: vi.fn() }));

describe("useTradeSelection", () => {
	it("does not restore a selection after the filter changes and changes back", () => {
		const first: TradeFilter = { portfolioId: 1 };
		const second: TradeFilter = { portfolioId: 1, symbol: "EURUSD" };
		const { result, rerender } = renderHook(
			({ filter }) => useTradeSelection(filter),
			{ initialProps: { filter: first } },
		);

		act(() => result.current.onToggle(7));
		expect([...result.current.selectedIds]).toEqual([7]);

		rerender({ filter: second });
		expect(result.current.selectedIds.size).toBe(0);

		rerender({ filter: first });
		expect(result.current.selectedIds.size).toBe(0);
	});
});
