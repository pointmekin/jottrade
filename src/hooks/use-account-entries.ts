import { useQuery } from "@tanstack/react-query";
import { getCashFlows } from "@/server/portfolioActions";

export const accountEntriesQueryKey = ["cash-flows"] as const;

/** Deposits, withdrawals, and adjustments for the active trading account. */
export function useAccountEntries(portfolioId?: number) {
	return useQuery({
		queryKey: [...accountEntriesQueryKey, portfolioId],
		queryFn: () => {
			if (portfolioId === undefined) {
				return Promise.reject(new Error("No active account."));
			}
			return getCashFlows({ data: { portfolioId } });
		},
		enabled: portfolioId !== undefined,
	});
}
