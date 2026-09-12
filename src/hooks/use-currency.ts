import { useQuery } from "@tanstack/react-query";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { getPortfolio } from "@/server/portfolioActions";

export const portfolioQueryKey = ["portfolio"] as const;

/** The ISO code every money value on screen is formatted in. */
export function useCurrency(): string {
	const { data } = useQuery({
		queryKey: portfolioQueryKey,
		queryFn: () => getPortfolio({ data: undefined }),
		staleTime: 10 * 60 * 1000,
	});

	return data?.currency ?? DEFAULT_CURRENCY;
}
