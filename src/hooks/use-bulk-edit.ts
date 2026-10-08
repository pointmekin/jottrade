import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccounts } from "@/hooks/use-accounts";
import { invalidateTradeQueries } from "@/lib/query-keys";
import {
	type BulkEditResult,
	BulkTradeAction,
	type BulkTradeChange,
} from "@/lib/trade-tag";
import { bulkEditTrades } from "@/server/tagActions";

const plural = (count: number) =>
	`${count} ${count === 1 ? "trade" : "trades"}`;

const DONE: Record<BulkTradeAction, string> = {
	[BulkTradeAction.AddTags]: "Tagged",
	[BulkTradeAction.RemoveTags]: "Removed tags from",
	[BulkTradeAction.SetStrategy]: "Set the strategy on",
	[BulkTradeAction.SetConfidence]: "Set the confidence on",
	[BulkTradeAction.MarkReviewed]: "Marked as reviewed:",
};

const UNCHANGED: Record<BulkTradeAction, string> = {
	[BulkTradeAction.AddTags]: "already had the tag",
	[BulkTradeAction.RemoveTags]: "did not have the tag",
	[BulkTradeAction.SetStrategy]: "already had this strategy",
	[BulkTradeAction.SetConfidence]: "already had this confidence",
	[BulkTradeAction.MarkReviewed]: "were already reviewed",
};

export function describeBulkResult(
	change: BulkTradeChange,
	{ selected, changed }: BulkEditResult,
) {
	const unchanged = selected - changed;
	const summary = `${DONE[change.action]} ${plural(changed)}.`;
	if (!unchanged) return summary;
	return `${summary} ${plural(unchanged)} ${UNCHANGED[change.action]}.`;
}

type BulkEditVariables = { tradeIds: number[]; change: BulkTradeChange };

export function useBulkEdit({ notify = true }: { notify?: boolean } = {}) {
	const queryClient = useQueryClient();
	const { activeAccount } = useAccounts();
	return useMutation({
		mutationFn: ({ tradeIds, change }: BulkEditVariables) => {
			if (!activeAccount) throw new Error("Choose an account first.");
			return bulkEditTrades({
				data: { portfolioId: activeAccount.id, tradeIds, change },
			});
		},
		onSuccess: (result, { change }) => {
			if (notify) toast.success(describeBulkResult(change, result));
			return invalidateTradeQueries(queryClient);
		},
		onError: (error) => {
			toast.error("The bulk edit failed.", { description: error.message });
		},
	});
}
