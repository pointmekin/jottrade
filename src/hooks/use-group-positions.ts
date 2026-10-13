import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccounts } from "@/hooks/use-accounts";
import { invalidateTradeQueries, QueryKey } from "@/lib/query-keys";
import {
	getGroupSuggestions,
	groupImportedTrades,
} from "@/server/positionActions";

export function useGroupSuggestions() {
	const { activeAccount } = useAccounts();
	const portfolioId = activeAccount?.id ?? 0;
	return useQuery({
		queryKey: [QueryKey.GroupSuggestions, portfolioId],
		queryFn: () => getGroupSuggestions({ data: { portfolioId } }),
		enabled: portfolioId > 0,
	});
}

export function useGroupBrokerRows() {
	const queryClient = useQueryClient();
	const { activeAccount } = useAccounts();
	return useMutation({
		mutationFn: (tradeIds: number[]) => {
			if (!activeAccount) throw new Error("Choose an account first.");
			return groupImportedTrades({
				data: { portfolioId: activeAccount.id, tradeIds },
			});
		},
		onSuccess: (_result, tradeIds) => {
			toast.success(
				`Grouped ${tradeIds.length} broker rows into one position.`,
			);
			return invalidateTradeQueries(queryClient);
		},
		onError: (error) => {
			toast.error("The rows were not grouped.", {
				description: error.message,
			});
		},
	});
}
