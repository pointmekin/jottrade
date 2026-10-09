import { useQuery } from "@tanstack/react-query";
import { Filter, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { PeriodPicker } from "@/components/period-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppliedView } from "@/hooks/use-saved-views";
import { useTags } from "@/hooks/use-tags";
import { SymbolMatch } from "@/lib/analysis-scope";
import { CLEARED_TRADE_FILTERS, NO_STRATEGY } from "@/lib/journal-search";
import { describePeriod, PeriodPreset } from "@/lib/period";
import { QueryKey } from "@/lib/query-keys";
import { type TradeSide, TradeStatus } from "@/lib/trade";
import { parseTagIds, TagMatch } from "@/lib/trade-tag";
import { getStrategies } from "@/server/strategyActions";
import { FilterFields } from "./filter-fields";
import { SavedViewsMenu } from "./saved-views-menu";

const SYMBOL_DEBOUNCE_MS = 300;

/** Read from and written to the URL search params. */
export type JournalFilters = {
	symbol?: string;
	symbolMatch?: SymbolMatch;
	side?: TradeSide;
	status?: TradeStatus;
	/** A strategy id, or "none". */
	setupId?: string;
	/** Comma-separated confidence levels. */
	confidence?: string;
	mistake?: string;
	/** Comma-separated tag ids. */
	tags?: string;
	tagMatch?: TagMatch;
	period?: PeriodPreset;
	dateFrom?: string;
	dateTo?: string;
	savedView?: number;
};

interface FilterBarProps {
	filters: JournalFilters;
	onFiltersChange: (filters: JournalFilters) => void;
}

function FilterChip({
	children,
	clearLabel,
	onClear,
}: {
	children: ReactNode;
	clearLabel: string;
	onClear: () => void;
}) {
	return (
		<Badge
			variant="outline"
			className="gap-1 rounded-md border-border font-data text-xs font-normal"
		>
			{children}
			<button
				type="button"
				className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label={clearLabel}
				onClick={onClear}
			>
				<X className="h-3 w-3" />
			</button>
		</Badge>
	);
}

function useDebouncedSymbol(
	symbol: string | undefined,
	onCommit: (symbol: string | undefined) => void,
) {
	const [symbolInput, setSymbolInput] = useState(symbol ?? "");
	const [syncedSymbol, setSyncedSymbol] = useState(symbol);
	if (symbol !== syncedSymbol) {
		setSyncedSymbol(symbol);
		setSymbolInput(symbol ?? "");
	}
	useEffect(() => {
		const timer = setTimeout(() => {
			if (symbolInput !== (symbol ?? "")) onCommit(symbolInput || undefined);
		}, SYMBOL_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [symbol, symbolInput, onCommit]);
	return [symbolInput, setSymbolInput] as const;
}

function TagFilterChip({
	filters,
	onClear,
}: {
	filters: JournalFilters;
	onClear: () => void;
}) {
	const { data: tags = [] } = useTags();
	const ids = new Set(parseTagIds(filters.tags));
	const names = tags.filter((tag) => ids.has(tag.id)).map((tag) => tag.name);
	const match = filters.tagMatch === TagMatch.All ? "all of" : "any of";
	return (
		<FilterChip clearLabel="Clear tag filter" onClear={onClear}>
			Tags, {match}: {names.join(", ") || `${ids.size} tags`}
		</FilterChip>
	);
}

function StrategyFilterChip({
	setupId,
	onClear,
}: {
	setupId: string;
	onClear: () => void;
}) {
	const { data: strategies = [] } = useQuery({
		queryKey: [QueryKey.Strategies],
		queryFn: () => getStrategies(),
	});
	const name =
		setupId === NO_STRATEGY
			? "None"
			: strategies.find((strategy) => String(strategy.id) === setupId)?.name;
	return (
		<FilterChip clearLabel="Clear strategy filter" onClear={onClear}>
			Strategy: {name ?? setupId}
		</FilterChip>
	);
}

function SavedViewChip({
	filters,
	onClear,
}: {
	filters: JournalFilters;
	onClear: () => void;
}) {
	const { view, isModified } = useAppliedView(filters);
	if (!view) return null;
	return (
		<FilterChip clearLabel="Close saved view" onClear={onClear}>
			View: {view.name}
			{isModified && (
				<span className="text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
					· Modified
				</span>
			)}
		</FilterChip>
	);
}

/** The scope date is the exit time for closed trades and the entry time for the others. */
const periodPrefix = (status?: TradeStatus) =>
	status === TradeStatus.Closed ? "Closed in" : "Closed or opened in";

function FilterChips({
	filters,
	update,
}: {
	filters: JournalFilters;
	update: (patch: Partial<JournalFilters>) => void;
}) {
	const period = filters.period ?? PeriodPreset.All;
	return (
		<div className="flex flex-wrap gap-2 border-t border-border py-2">
			<SavedViewChip
				filters={filters}
				onClear={() => update({ savedView: undefined })}
			/>
			{period !== PeriodPreset.All && (
				<FilterChip
					clearLabel="Clear period filter"
					onClear={() =>
						update({
							period: PeriodPreset.All,
							dateFrom: undefined,
							dateTo: undefined,
						})
					}
				>
					{periodPrefix(filters.status)}:{" "}
					{describePeriod({
						preset: period,
						from: filters.dateFrom,
						to: filters.dateTo,
					})}
				</FilterChip>
			)}
			{filters.symbol && (
				<FilterChip
					clearLabel="Clear symbol filter"
					onClear={() => update({ symbol: undefined, symbolMatch: undefined })}
				>
					{filters.symbolMatch === SymbolMatch.Exact ? "Symbol is" : "Symbol:"}{" "}
					{filters.symbol}
				</FilterChip>
			)}
			{filters.side && (
				<FilterChip
					clearLabel="Clear side filter"
					onClear={() => update({ side: undefined })}
				>
					{filters.side}
				</FilterChip>
			)}
			{filters.status && (
				<FilterChip
					clearLabel="Clear status filter"
					onClear={() => update({ status: undefined })}
				>
					{filters.status}
				</FilterChip>
			)}
			{filters.setupId && (
				<StrategyFilterChip
					setupId={filters.setupId}
					onClear={() => update({ setupId: undefined })}
				/>
			)}
			{filters.confidence && (
				<FilterChip
					clearLabel="Clear confidence filter"
					onClear={() => update({ confidence: undefined })}
				>
					Confidence: {filters.confidence.replaceAll(",", ", ")}
				</FilterChip>
			)}
			{filters.mistake && (
				<FilterChip
					clearLabel="Clear mistake filter"
					onClear={() => update({ mistake: undefined })}
				>
					Mistake: {filters.mistake.replaceAll(",", ", ")}
				</FilterChip>
			)}
			{filters.tags && (
				<TagFilterChip
					filters={filters}
					onClear={() => update({ tags: undefined, tagMatch: undefined })}
				/>
			)}
		</div>
	);
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const fieldsId = useId();
	const update = useCallback(
		(patch: Partial<JournalFilters>) =>
			onFiltersChange({ ...filters, ...patch }),
		[filters, onFiltersChange],
	);
	const commitSymbol = useCallback(
		(symbol: string | undefined) => update({ symbol, symbolMatch: undefined }),
		[update],
	);
	const [symbolInput, setSymbolInput] = useDebouncedSymbol(
		filters.symbol,
		commitSymbol,
	);

	const period = filters.period ?? PeriodPreset.All;
	const activeCount = [
		filters.symbol,
		filters.side,
		filters.status,
		filters.setupId,
		filters.confidence,
		filters.mistake,
		filters.tags,
	].filter(Boolean).length;
	const { view: appliedView } = useAppliedView(filters);
	const clearAll = () => {
		setSymbolInput("");
		update(CLEARED_TRADE_FILTERS);
	};

	return (
		<section aria-label="Filters" className="border-y border-border">
			<div className="flex min-w-0 flex-wrap items-center gap-2 py-2.5">
				<PeriodPicker
					value={{ preset: period, from: filters.dateFrom, to: filters.dateTo }}
					onChange={(next) =>
						update({
							period: next.preset,
							dateFrom: next.from,
							dateTo: next.to,
						})
					}
				/>
				<SavedViewsMenu filters={filters} update={update} />
				<Button
					variant="outline"
					size="sm"
					className="h-9 border-border bg-background"
					aria-expanded={isExpanded}
					aria-controls={fieldsId}
					onClick={() => setIsExpanded(!isExpanded)}
				>
					<Filter className="mr-2 h-3.5 w-3.5" />
					Filters
					{activeCount > 0 && (
						<Badge className="ml-2 h-4 rounded-md bg-ring px-1.5 font-data text-xs text-background">
							{activeCount}
						</Badge>
					)}
				</Button>
				{activeCount > 0 && (
					<Button
						variant="ghost"
						size="sm"
						className="h-9 text-muted-foreground sm:ml-auto"
						onClick={clearAll}
					>
						<X className="mr-1 h-3.5 w-3.5" /> Clear all
					</Button>
				)}
			</div>
			{isExpanded && (
				<FilterFields
					id={fieldsId}
					filters={filters}
					symbolInput={symbolInput}
					onSymbolInput={setSymbolInput}
					update={update}
				/>
			)}
			{(activeCount > 0 ||
				period !== PeriodPreset.All ||
				appliedView !== undefined) && (
				<FilterChips filters={filters} update={update} />
			)}
		</section>
	);
}
