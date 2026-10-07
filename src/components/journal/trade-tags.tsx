import { Plus } from "lucide-react";
import { useId } from "react";
import { TagChip } from "@/components/tags/tag-chip";
import { TagPicker } from "@/components/tags/tag-picker";
import { Button } from "@/components/ui/button";
import { useBulkEdit } from "@/hooks/use-bulk-edit";
import type { Trade } from "@/lib/trade";
import { BulkTradeAction, type TradeTag } from "@/lib/trade-tag";

export function TradeTags({ trade }: { trade: Trade }) {
	const headingId = useId();
	const edit = useBulkEdit({ notify: false });
	const tags = trade.tags ?? [];
	const selectedIds = tags.map((tag) => tag.id);
	const change = (
		action: typeof BulkTradeAction.AddTags | typeof BulkTradeAction.RemoveTags,
		tag: TradeTag,
	) =>
		edit.mutate({ tradeIds: [trade.id], change: { action, tagIds: [tag.id] } });
	const toggle = (tag: TradeTag) =>
		change(
			selectedIds.includes(tag.id)
				? BulkTradeAction.RemoveTags
				: BulkTradeAction.AddTags,
			tag,
		);

	return (
		<section aria-labelledby={headingId} className="space-y-2">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 id={headingId} className="text-sm font-medium">
						Tags
					</h3>
					<p className="text-xs text-muted-foreground">
						Mark every factor that applied, such as news, late entry or tilt.
					</p>
				</div>
				<TagPicker
					align="end"
					selectedIds={selectedIds}
					onSelect={toggle}
					trigger={
						<Button
							variant="outline"
							size="sm"
							className="h-8"
							disabled={edit.isPending}
						>
							<Plus className="mr-1 size-3.5" /> Add tag
						</Button>
					}
				/>
			</div>
			{tags.length > 0 ? (
				<ul className="flex flex-wrap gap-1.5" aria-label="Trade tags">
					{tags.map((tag) => (
						<li key={tag.id}>
							<TagChip
								tag={tag}
								onRemove={() => change(BulkTradeAction.RemoveTags, tag)}
							/>
						</li>
					))}
				</ul>
			) : (
				<p className="text-xs text-muted-foreground">No tags on this trade.</p>
			)}
		</section>
	);
}
