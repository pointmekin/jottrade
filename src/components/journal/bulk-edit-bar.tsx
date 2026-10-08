import { useQuery } from "@tanstack/react-query";
import { CheckCheck, ChevronDown, Tag, TagsIcon, X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { TagPicker } from "@/components/tags/tag-picker";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBulkEdit } from "@/hooks/use-bulk-edit";
import { QueryKey } from "@/lib/query-keys";
import { TradeConfidence } from "@/lib/trade";
import {
	BULK_EDIT_LIMIT,
	BulkTradeAction,
	type BulkTradeChange,
} from "@/lib/trade-tag";
import { getStrategies } from "@/server/strategyActions";

interface BulkEditBarProps {
	selectedIds: number[];
	matchingTotal: number;
	isSelectingAll: boolean;
	onSelectAllMatching: () => void;
	onClear: () => void;
}

function ActionButton({
	children,
	...props
}: ComponentProps<typeof Button> & { children: ReactNode }) {
	return (
		<Button variant="ghost" size="sm" className="h-8 px-2.5" {...props}>
			{children}
		</Button>
	);
}

function SelectAllMatching({
	count,
	total,
	isLoading,
	onSelect,
}: {
	count: number;
	total: number;
	isLoading: boolean;
	onSelect: () => void;
}) {
	if (count >= total) return null;
	if (total > BULK_EDIT_LIMIT)
		return (
			<span className="text-xs text-muted-foreground">
				{`${total} match. Narrow the filter to edit more than one page at a time (limit ${BULK_EDIT_LIMIT}).`}
			</span>
		);
	return (
		<Button
			variant="link"
			size="sm"
			className="h-8 px-1 text-xs"
			disabled={isLoading}
			onClick={onSelect}
		>
			{isLoading ? "Selecting…" : `Select all ${total} matching`}
		</Button>
	);
}

export function BulkEditBar({
	selectedIds,
	matchingTotal,
	isSelectingAll,
	onSelectAllMatching,
	onClear,
}: BulkEditBarProps) {
	const edit = useBulkEdit();
	const { data: strategies = [], isSuccess: hasStrategies } = useQuery({
		queryKey: [QueryKey.Strategies],
		queryFn: () => getStrategies(),
	});
	const count = selectedIds.length;
	// A finished edit can move trades out of the filtered view, so the selection
	// starts again rather than keep trades the user can no longer see.
	const apply = (change: BulkTradeChange) =>
		edit.mutate({ tradeIds: selectedIds, change }, { onSettled: onClear });
	const isBusy = edit.isPending;

	return (
		<section
			aria-label="Bulk edit selected trades"
			className="sticky bottom-20 z-20 md:bottom-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out"
		>
			<div className="surface flex flex-wrap items-center gap-1 bg-popover px-3 py-2 shadow-lg">
				<p className="mr-1 text-sm font-medium" aria-live="polite">
					<span className="font-data tabular-nums">{count}</span> selected
				</p>
				<SelectAllMatching
					count={count}
					total={matchingTotal}
					isLoading={isSelectingAll}
					onSelect={onSelectAllMatching}
				/>
				<div className="ml-auto flex flex-wrap items-center gap-0.5">
					<TagPicker
						align="end"
						selectedIds={[]}
						onSelect={(tag) =>
							apply({ action: BulkTradeAction.AddTags, tagIds: [tag.id] })
						}
						trigger={
							<ActionButton disabled={isBusy}>
								<Tag className="mr-1.5 size-3.5" /> Add tag
							</ActionButton>
						}
					/>
					<TagPicker
						align="end"
						canCreate={false}
						placeholder="Find a tag to remove"
						selectedIds={[]}
						onSelect={(tag) =>
							apply({ action: BulkTradeAction.RemoveTags, tagIds: [tag.id] })
						}
						trigger={
							<ActionButton disabled={isBusy}>
								<TagsIcon className="mr-1.5 size-3.5" /> Remove tag
							</ActionButton>
						}
					/>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<ActionButton disabled={isBusy || !hasStrategies}>
								Strategy <ChevronDown className="ml-1 size-3.5" />
							</ActionButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{strategies.map((strategy) => (
								<DropdownMenuItem
									key={strategy.id}
									onSelect={() =>
										apply({
											action: BulkTradeAction.SetStrategy,
											setupId: strategy.id,
										})
									}
								>
									{strategy.name}
								</DropdownMenuItem>
							))}
							{strategies.length > 0 && <DropdownMenuSeparator />}
							<DropdownMenuItem
								onSelect={() =>
									apply({ action: BulkTradeAction.SetStrategy, setupId: null })
								}
							>
								No strategy
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<ActionButton disabled={isBusy}>
								Confidence <ChevronDown className="ml-1 size-3.5" />
							</ActionButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{Object.values(TradeConfidence).map((confidence) => (
								<DropdownMenuItem
									key={confidence}
									onSelect={() =>
										apply({ action: BulkTradeAction.SetConfidence, confidence })
									}
								>
									{confidence}
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onSelect={() =>
									apply({
										action: BulkTradeAction.SetConfidence,
										confidence: null,
									})
								}
							>
								Clear confidence
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<ActionButton
						disabled={isBusy}
						onClick={() => apply({ action: BulkTradeAction.MarkReviewed })}
					>
						<CheckCheck className="mr-1.5 size-3.5" /> Mark reviewed
					</ActionButton>
					<ActionButton aria-label="Clear selection" onClick={onClear}>
						<X className="size-3.5" />
					</ActionButton>
				</div>
			</div>
		</section>
	);
}
