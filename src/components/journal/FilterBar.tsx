import { useQuery } from "@tanstack/react-query";
import { Filter, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PeriodPicker } from "@/components/period-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { describePeriod, PeriodPreset } from "@/lib/period";
import { getStrategies } from "@/server/strategyActions";

// Filter state read/written to URL search params
export type JournalFilters = {
	symbol?: string;
	side?: "LONG" | "SHORT";
	status?: "OPEN" | "CLOSED" | "PENDING";
	setupId?: string; // number or "none"
	confidence?: string; // comma-separated
	mistake?: string;
	period?: PeriodPreset;
	/** Bounds of the custom period. */
	dateFrom?: string;
	dateTo?: string;
	page?: number;
};

interface FilterBarProps {
	filters: JournalFilters;
	onFiltersChange: (filters: JournalFilters) => void;
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
	const [expanded, setExpanded] = useState(false);
	const [symbolInput, setSymbolInput] = useState(filters.symbol ?? "");
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	const { data: strategies = [] } = useQuery({
		queryKey: ["strategies"],
		queryFn: () => getStrategies({ data: undefined }),
	});

	const update = useCallback(
		(patch: Partial<JournalFilters>) => {
			onFiltersChange({ ...filters, ...patch, page: 1 });
		},
		[filters, onFiltersChange],
	);

	useEffect(() => {
		clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			if (symbolInput !== (filters.symbol ?? "")) {
				update({ symbol: symbolInput || undefined });
			}
		}, 300);
		return () => clearTimeout(debounceRef.current);
	}, [filters.symbol, symbolInput, update]);

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
		<div className="space-y-3">
			<div className="surface flex min-w-0 flex-wrap items-center gap-2 p-2">
				<PeriodPicker
					value={{
						preset: period,
						from: filters.dateFrom,
						to: filters.dateTo,
					}}
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
					aria-expanded={expanded}
					onClick={() => setExpanded(!expanded)}
				>
					<Filter className="h-3.5 w-3.5 mr-2" />
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
						className="h-9 text-muted-foreground"
						onClick={clearAll}
					>
						<X className="h-3.5 w-3.5 mr-1" /> Clear all
					</Button>
				)}
			</div>

			{expanded && (
				<div className="surface grid grid-cols-2 gap-3 p-3 md:grid-cols-4 md:p-4">
					{/* Symbol */}
					<div>
						<p className="field-label mb-1">Symbol</p>
						<Input
							value={symbolInput}
							onChange={(e) => setSymbolInput(e.target.value)}
							placeholder="AAPL"
							className="h-9 bg-background text-sm"
						/>
					</div>

					{/* Side */}
					<div>
						<p className="field-label mb-1">Side</p>
						<div className="flex gap-1">
							{(["LONG", "SHORT"] as const).map((s) => (
								<Button
									key={s}
									size="sm"
									variant="outline"
									className={`h-9 flex-1 text-xs ${filters.side === s ? "border-ring bg-accent text-accent-foreground" : "text-muted-foreground"}`}
									aria-pressed={filters.side === s}
									onClick={() =>
										update({ side: filters.side === s ? undefined : s })
									}
								>
									{s}
								</Button>
							))}
						</div>
					</div>

					{/* Status */}
					<div>
						<p className="field-label mb-1">Status</p>
						<Select
							value={filters.status ?? ""}
							onValueChange={(v) =>
								update({ status: v === "__all__" ? undefined : (v as any) })
							}
						>
							<SelectTrigger className="h-9 bg-background text-sm">
								<SelectValue placeholder="All" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__all__">All</SelectItem>
								{["OPEN", "CLOSED", "PENDING"].map((s) => (
									<SelectItem key={s} value={s}>
										{s}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Strategy */}
					<div>
						<p className="field-label mb-1">Strategy</p>
						<Select
							value={filters.setupId ?? ""}
							onValueChange={(v) => update({ setupId: v || undefined })}
						>
							<SelectTrigger className="h-9 bg-background text-sm">
								<SelectValue placeholder="All" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="">All</SelectItem>
								<SelectItem value="none">No Strategy</SelectItem>
								{(strategies as any[]).map((s: any) => (
									<SelectItem key={s.id} value={String(s.id)}>
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Confidence */}
					<div>
						<p className="field-label mb-1">Confidence</p>
						<div className="flex gap-1">
							{(["HIGH", "MEDIUM", "LOW"] as const).map((c) => {
								const active = (filters.confidence ?? "")
									.split(",")
									.filter(Boolean)
									.includes(c);
								const toggle = () => {
									const current = (filters.confidence ?? "")
										.split(",")
										.filter(Boolean);
									const next = active
										? current.filter((x) => x !== c)
										: [...current, c];
									update({ confidence: next.join(",") || undefined });
								};
								return (
									<Button
										key={c}
										size="sm"
										variant="outline"
										className={`h-9 flex-1 text-xs ${active ? "border-ring bg-accent text-accent-foreground" : "text-muted-foreground"}`}
										aria-pressed={active}
										onClick={toggle}
									>
										{c[0]}
									</Button>
								);
							})}
						</div>
					</div>
				</div>
			)}

			{/* Active filter chips */}
			{(activeCount > 0 || period !== PeriodPreset.All) && (
				<div className="flex flex-wrap gap-2">
					{period !== PeriodPreset.All && (
						<Badge
							variant="outline"
							className="gap-1 rounded-md border-border font-data text-xs uppercase"
						>
							{describePeriod({
								preset: period,
								from: filters.dateFrom,
								to: filters.dateTo,
							})}
							<X
								className="h-3 w-3 cursor-pointer"
								onClick={() =>
									update({
										period: PeriodPreset.All,
										dateFrom: undefined,
										dateTo: undefined,
									})
								}
							/>
						</Badge>
					)}
					{filters.symbol && (
						<Badge
							variant="outline"
							className="gap-1 rounded-md border-border font-data text-xs uppercase"
						>
							Symbol: {filters.symbol}
							<X
								className="h-3 w-3 cursor-pointer"
								onClick={() => update({ symbol: undefined })}
							/>
						</Badge>
					)}
					{filters.side && (
						<Badge
							variant="outline"
							className="gap-1 rounded-md border-border font-data text-xs uppercase"
						>
							{filters.side}
							<X
								className="h-3 w-3 cursor-pointer"
								onClick={() => update({ side: undefined })}
							/>
						</Badge>
					)}
					{filters.status && (
						<Badge
							variant="outline"
							className="gap-1 rounded-md border-border font-data text-xs uppercase"
						>
							{filters.status}
							<X
								className="h-3 w-3 cursor-pointer"
								onClick={() => update({ status: undefined })}
							/>
						</Badge>
					)}
				</div>
			)}
		</div>
	);
}
