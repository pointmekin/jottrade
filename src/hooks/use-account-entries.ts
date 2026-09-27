import { useQuery } from "@tanstack/react-query";
import { QueryKey } from "@/lib/query-keys";
import { getCashFlows } from "@/server/cashFlowActions";

/** Deposits, withdrawals, and adjustments for the active trading account. */
export function useAccountEntries(portfolioId?: number) {
	return useQuery({
		queryKey: [QueryKey.AccountEntries, portfolioId],
		queryFn: () => {
			if (portfolioId === undefined) {
				return Promise.reject(new Error("No active account."));
			}
			return getCashFlows({ data: { portfolioId } });
		},
		enabled: portfolioId !== undefined,
	});
}
