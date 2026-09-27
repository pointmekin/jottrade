import type { QueryClient } from "@tanstack/react-query";
import { accountsQueryKey } from "@/hooks/use-accounts";

/** Every query that reads trades. A trade change refreshes all of them, so screens agree. */
export const tradeQueryKeys = [
	["trades"],
	["trade"],
	["calendar"],
	["analytics"],
	["advanced-analytics"],
	["strategy-performance"],
	accountsQueryKey,
] as const;

export function invalidateTradeQueries(queryClient: QueryClient) {
	return Promise.all(
		tradeQueryKeys.map((queryKey) =>
			queryClient.invalidateQueries({ queryKey }),
		),
	);
}
