import { Filter, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScopeNoticeProps {
	scope: { isFiltered: boolean; excludedAdjustments: number };
	isEmpty: boolean;
	onClear: () => void;
}

export function ScopeNotice({ scope, isEmpty, onClear }: ScopeNoticeProps) {
	if (isEmpty)
		return (
			<div className="empty-field mt-4 min-h-0 py-8">
				<SearchX className="mb-3 size-5 text-muted-foreground" />
				<p className="font-semibold">No closed trades match this scope</p>
				<Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
					Clear filters
				</Button>
			</div>
		);
	if (!scope.isFiltered) return null;
	const adjustments =
		scope.excludedAdjustments === 1 ? "adjustment" : "adjustments";
	return (
		<p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
			<Filter className="size-3.5 shrink-0" />
			<span>
				<span className="font-medium text-foreground">
					Filtered: trading performance only
				</span>
				{` · Excludes ${scope.excludedAdjustments} account ${adjustments}`}
			</span>
		</p>
	);
}
