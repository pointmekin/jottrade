import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAccounts } from "@/hooks/use-accounts";
import { type PeriodSelection, resolvePeriod } from "@/lib/period";
import { QueryKey } from "@/lib/query-keys";
import { getAdvancedAnalytics } from "@/server/getAdvancedAnalytics";
import { getAnalytics } from "@/server/getAnalytics";

const ADVANCED_STALE_MS = 5 * 60 * 1000;

/** The period resolves against the browser clock, so "this month" follows the user's timezone. */
export function useDashboardAnalytics(selection: PeriodSelection) {
	const { activeAccount } = useAccounts();
	const portfolioId = activeAccount?.id;

	const rangeInput = useMemo(() => {
		const { from, to } = resolvePeriod(selection);
		return {
			portfolioId: portfolioId as number,
			from: from?.toISOString(),
			to: to?.toISOString(),
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		};
	}, [selection, portfolioId]);
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
