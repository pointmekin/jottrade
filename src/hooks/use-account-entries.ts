import { useQuery } from "@tanstack/react-query";
import { getCashFlows } from "@/server/portfolioActions";

export const accountEntriesQueryKey = ["cash-flows"] as const;

/** Deposits, withdrawals, and adjustments for the signed-in user. */
export function useAccountEntries() {
	return useQuery({
		queryKey: accountEntriesQueryKey,
		queryFn: () => getCashFlows({ data: undefined }),
	});
}
