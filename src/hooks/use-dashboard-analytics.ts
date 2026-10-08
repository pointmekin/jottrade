import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAccounts } from "@/hooks/use-accounts";
import { type ScopeSearch, toTradeQuery } from "@/lib/journal-search";
import { resolvePeriod } from "@/lib/period";
import { QueryKey } from "@/lib/query-keys";
import { getAdvancedAnalytics } from "@/server/getAdvancedAnalytics";
import { getAnalytics } from "@/server/getAnalytics";

const ADVANCED_STALE_MS = 5 * 60 * 1000;

/** The period resolves against the browser clock, so "this month" follows the user's timezone. */
export function useDashboardAnalytics(search: ScopeSearch) {
	const { activeAccount } = useAccounts();
	const portfolioId = activeAccount?.id;

	const rangeInput = useMemo(() => {
		const range = resolvePeriod({
			preset: search.period,
			from: search.dateFrom,
			to: search.dateTo,
		});
		return {
			...toTradeQuery(search, range),
			portfolioId: portfolioId as number,
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		};
	}, [search, portfolioId]);
	const enabled = portfolioId !== undefined;

	const summary = useQuery({
		queryKey: [QueryKey.Analytics, rangeInput],
		queryFn: () => getAnalytics({ data: rangeInput }),
		enabled,
	});
	const advanced = useQuery({
		queryKey: [QueryKey.AdvancedAnalytics, rangeInput],
		queryFn: () => getAdvancedAnalytics({ data: rangeInput }),
		staleTime: ADVANCED_STALE_MS,
		enabled,
	});

	return { summary, advanced };
}
