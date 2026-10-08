// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { JournalTable } from "@/components/journal/JournalTable";
import { tradeOrder } from "@/db/trade-filter";
import { journalSearchSchema, toTradeQuery } from "@/lib/journal-search";
import {
	isDefaultTradeSort,
	nextTradeSort,
	SortDirection,
	sortedTradeFilterSchema,
	TradeSortField,
} from "@/lib/trade-sort";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));

const orderSql = (...order: ReturnType<typeof tradeOrder>) =>
	new PgDialect().sqlToQuery(sql.join(order, sql`, `)).sql;

describe("tradeOrder", () => {
	it("puts nulls last and breaks equal values by id in the same direction", () => {
		expect(
			orderSql(
				...tradeOrder({ sort: TradeSortField.NetPnl, dir: SortDirection.Desc }),
			),
		).toBe('"trades"."net_pnl" desc nulls last, "trades"."id" desc');
		expect(
			orderSql(
				...tradeOrder({ sort: TradeSortField.Symbol, dir: SortDirection.Asc }),
			),
		).toBe('"trades"."symbol" asc nulls last, "trades"."id" asc');
	});

	it("sorts the scope date with the same expression as the filter", () => {
		expect(
			orderSql(
				...tradeOrder({
					sort: TradeSortField.ScopeDate,
					dir: SortDirection.Desc,
				}),
			),
		).toContain(
			'case when "trades"."status" = $1 then coalesce("trades"."exit_date", "trades"."entry_date") else "trades"."entry_date" end desc nulls last',
		);
	});

	it("defaults to newest entry first and rejects a field outside the allow-list", () => {
		expect(sortedTradeFilterSchema.parse({ portfolioId: 1 })).toMatchObject({
			sort: TradeSortField.EntryDate,
			dir: SortDirection.Desc,
		});
		expect(
			sortedTradeFilterSchema.safeParse({ portfolioId: 1, sort: "user_id" })
				.success,
		).toBe(false);
	});
});

describe("sort in the journal URL", () => {
	it("drops an unknown sort and keeps a valid one in the trade query", () => {
		const search = journalSearchSchema.parse({ sort: "id; drop", dir: "up" });
		expect(search.sort).toBeUndefined();
		expect(search.dir).toBeUndefined();

		const sorted = journalSearchSchema.parse({ sort: "netPnl", dir: "asc" });
		expect(toTradeQuery(sorted, { from: null, to: null })).toMatchObject({
			sort: TradeSortField.NetPnl,
			dir: SortDirection.Asc,
		});
	});

	it("flips the same column and starts a new one in its natural direction", () => {
		const current = { sort: TradeSortField.NetPnl, dir: SortDirection.Desc };
		expect(nextTradeSort(current, TradeSortField.NetPnl).dir).toBe(
			SortDirection.Asc,
		);
		expect(nextTradeSort(current, TradeSortField.Symbol).dir).toBe(
			SortDirection.Asc,
		);
		expect(nextTradeSort(current, TradeSortField.ReturnPercent).dir).toBe(
			SortDirection.Desc,
		);
		expect(isDefaultTradeSort(current)).toBe(false);
		expect(
			isDefaultTradeSort({
				sort: TradeSortField.EntryDate,
				dir: SortDirection.Desc,
			}),
		).toBe(true);
	});
});

describe("sortable journal headers", () => {
	it("marks the sorted column and sorts another column from the keyboard", () => {
		const onSortChange = vi.fn();
		render(
			<JournalTable
				entries={[]}
				sort={{
					current: { sort: TradeSortField.NetPnl, dir: SortDirection.Desc },
					onSortChange,
				}}
			/>,
		);

		const pnlHeader = screen.getByRole("columnheader", { name: /Net P&L/ });
		expect(pnlHeader.getAttribute("aria-sort")).toBe("descending");
		expect(
			screen
				.getByRole("columnheader", { name: /Symbol/ })
				.getAttribute("aria-sort"),
		).toBeNull();

		const symbolSort = screen.getByRole("button", { name: "Sort by symbol" });
		symbolSort.focus();
		fireEvent.click(symbolSort);
		expect(onSortChange).toHaveBeenCalledWith(TradeSortField.Symbol);
	});
});
