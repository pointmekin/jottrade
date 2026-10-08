import { useQuery } from "@tanstack/react-query";
import { useAccountEntries } from "@/hooks/use-account-entries";
import { useAccounts } from "@/hooks/use-accounts";
import { AccountEntryKind } from "@/lib/account-entry";
import { mergeJournalEntries } from "@/lib/journal-entries";
import {
	adjustmentsInRange,
	adjustmentsOnPage,
	type JournalSearch,
	JournalView,
	toTradeQuery,
} from "@/lib/journal-search";
import { resolvePeriod } from "@/lib/period";
import { QueryKey } from "@/lib/query-keys";
import type { Trade } from "@/lib/trade";
import { isDefaultTradeSort, tradeSortSchema } from "@/lib/trade-sort";
import { getTrades } from "@/server/getTrades";

export function useJournalEntries(search: JournalSearch) {
	const { activeAccount } = useAccounts();
	const portfolioId = activeAccount?.id;
	const range = resolvePeriod({
		preset: search.period,
		from: search.dateFrom,
		to: search.dateTo,
	});
	const query = toTradeQuery(search, range);
	const filter =
		portfolioId === undefined
			? undefined
			: { ...query, page: undefined, portfolioId };

	const trades = useQuery({
		queryKey: [QueryKey.Trades, portfolioId, query],
		queryFn: () =>
			getTrades({ data: { ...query, portfolioId: portfolioId as number } }),
		enabled: portfolioId !== undefined,
	});
	const accountEntries = useAccountEntries(portfolioId);

	const tradeList: Trade[] = trades.data?.trades ?? [];
	const total = trades.data?.total ?? 0;
	const page = trades.data?.page ?? 1;
	const totalPages = Math.ceil(total / (trades.data?.pageSize ?? 1));
	const adjustments = adjustmentsInRange(
		(accountEntries.data ?? []).filter(
			(entry) => entry.kind === AccountEntryKind.Adjustment,
		),
		range,
	);
	const pageAdjustments = adjustmentsOnPage(adjustments, {
		number: page,
		totalPages,
		newest: tradeList[0]?.entryDate,
		oldest: tradeList.at(-1)?.entryDate,
	});

	return {
		entries: mergeJournalEntries(
			tradeList,
			search.view === JournalView.All &&
				isDefaultTradeSort(tradeSortSchema.parse(search))
				? pageAdjustments
				: [],
		),
		total,
		closedSummary: trades.data?.closedSummary ?? { count: 0, netPnl: 0 },
		page,
		totalPages,
		adjustmentCount: adjustments.length,
		filter,
		isLoading:
			trades.isPending ||
			(search.view === JournalView.All && accountEntries.isPending),
	};
}
