import { useQuery } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/use-accounts";
import type { ScopeSearch } from "@/lib/journal-search";
import { QueryKey } from "@/lib/query-keys";
import { isSameScope } from "@/lib/saved-view";
import { getSavedViews } from "@/server/savedViewActions";

export function useSavedViews() {
	return useQuery({
		queryKey: [QueryKey.SavedViews],
		queryFn: () => getSavedViews(),
	});
}

export function useAppliedView(search: Partial<ScopeSearch>) {
	const { data: views = [] } = useSavedViews();
	const { activeAccount } = useAccounts();
	const view = views.find((saved) => saved.id === search.savedView);
	const isOtherAccount =
		view?.portfolioId != null && view.portfolioId !== activeAccount?.id;
	return {
		view,
		isModified: Boolean(
			view && (isOtherAccount || !isSameScope(search, view.scope)),
		),
	};
}
