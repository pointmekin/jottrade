import { useState } from "react";
import { toast } from "sonner";
import type { TradeFilter } from "@/db/trade-filter";
import { BULK_EDIT_LIMIT } from "@/lib/trade-tag";
import { getTradeIds } from "@/server/getTrades";

/**
 * Holds an explicit list of trade ids, so a bulk edit changes exactly the
 * trades the user saw selected. A new filter or account clears the list.
 */
export function useTradeSelection(filter: TradeFilter | undefined) {
	const scope = JSON.stringify(filter ?? null);
	const [state, setState] = useState({ scope, ids: new Set<number>() });
	if (state.scope !== scope) setState({ scope, ids: new Set() });
	const ids = state.scope === scope ? state.ids : new Set<number>();
	const update = (next: Set<number>) => setState({ scope, ids: next });

	const [isSelectingAll, setIsSelectingAll] = useState(false);
	const selectAllMatching = async () => {
		if (!filter) return;
		setIsSelectingAll(true);
		try {
			const matching = await getTradeIds({ data: filter });
			if (matching.length > BULK_EDIT_LIMIT)
				toast.error(
					`More than ${BULK_EDIT_LIMIT} trades match. Narrow the filter and try again.`,
				);
			else update(new Set(matching));
		} catch (error) {
			toast.error("The trades were not selected.", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsSelectingAll(false);
		}
	};

	return {
		selectedIds: ids,
		onToggle: (tradeId: number) => {
			const next = new Set(ids);
			if (!next.delete(tradeId)) next.add(tradeId);
			update(next);
		},
		onTogglePage: (tradeIds: number[], isSelected: boolean) => {
			const next = new Set(ids);
			for (const id of tradeIds) {
				if (isSelected) next.add(id);
				else next.delete(id);
			}
			update(next);
		},
		clear: () => update(new Set()),
		selectAllMatching,
		isSelectingAll,
	};
}
