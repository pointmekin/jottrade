import { z } from "zod";
import { tradeFilterSchema } from "./analysis-scope";

export const TradeSortField = {
	EntryDate: "entryDate",
	ScopeDate: "scopeDate",
	Symbol: "symbol",
	NetPnl: "netPnl",
	ReturnPercent: "returnPercent",
} as const;

export type TradeSortField =
	(typeof TradeSortField)[keyof typeof TradeSortField];

export const SortDirection = { Asc: "asc", Desc: "desc" } as const;

export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

export const tradeSortSchema = z.object({
	sort: z.enum(TradeSortField).default(TradeSortField.EntryDate),
	dir: z.enum(SortDirection).default(SortDirection.Desc),
});

export type TradeSort = z.infer<typeof tradeSortSchema>;

export const sortedTradeFilterSchema = tradeFilterSchema.extend(
	tradeSortSchema.shape,
);

/** Adjustments interleave by date only in the default newest-first order. */
export const isDefaultTradeSort = ({ sort, dir }: TradeSort) =>
	sort === TradeSortField.EntryDate && dir === SortDirection.Desc;

/** A new column starts A to Z for symbols and newest or largest first otherwise; the same column flips. */
export function nextTradeSort(current: TradeSort, field: TradeSortField) {
	if (current.sort === field)
		return {
			sort: field,
			dir:
				current.dir === SortDirection.Desc
					? SortDirection.Asc
					: SortDirection.Desc,
		};
	return {
		sort: field,
		dir:
			field === TradeSortField.Symbol ? SortDirection.Asc : SortDirection.Desc,
	};
}
