import { Filter, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { PeriodPicker } from "@/components/period-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describePeriod, PeriodPreset } from "@/lib/period";
import type { TradeSide, TradeStatus } from "@/lib/trade";
import { FilterFields } from "./filter-fields";

const SYMBOL_DEBOUNCE_MS = 300;

/** Read from and written to the URL search params. */
export type JournalFilters = {
	symbol?: string;
	side?: TradeSide;
	status?: TradeStatus;
	/** A strategy id, or "none". */
	setupId?: string;
	/** Comma-separated confidence levels. */
	confidence?: string;
	mistake?: string;
	period?: PeriodPreset;
	dateFrom?: string;
	dateTo?: string;
	page?: number;
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
	useEffect(() => {
		const timer = setTimeout(() => {
			if (symbolInput !== (symbol ?? "")) onCommit(symbolInput || undefined);
		}, SYMBOL_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [symbol, symbolInput, onCommit]);
	return [symbolInput, setSymbolInput] as const;
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const fieldsId = useId();
	const update = useCallback(
		(patch: Partial<JournalFilters>) =>
			onFiltersChange({ ...filters, ...patch, page: 1 }),
		[filters, onFiltersChange],
	);
	const commitSymbol = useCallback(
		(symbol: string | undefined) => update({ symbol }),
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
	].filter(Boolean).length;
	const clearAll = () => {
		setSymbolInput("");
		onFiltersChange({ page: 1, period });
	};

	return (
		<section aria-label="Journal filters" className="border-y border-border">
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
			{(activeCount > 0 || period !== PeriodPreset.All) && (
				<div className="flex flex-wrap gap-2 border-t border-border py-2">
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
							onClear={() => update({ symbol: undefined })}
						>
							Symbol: {filters.symbol}
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
				</div>
			)}
		</section>
	);
}
