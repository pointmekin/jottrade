import {
	flexRender,
	getCoreRowModel,
	type Row,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useCurrency } from "@/hooks/use-currency";
import { JournalEntryKind } from "@/lib/journal-entries";
import type { Trade } from "@/lib/trade";
import {
	SortDirection,
	type TradeSort,
	type TradeSortField,
} from "@/lib/trade-sort";
import { cn } from "@/lib/utils";
import {
	type JournalRow,
	journalColumnDefs,
	SORTABLE_COLUMNS,
} from "./journal-columns";
import { AdjustmentCard, TradeCard } from "./journal-mobile-cards";

const MOBILE_SKELETON_KEYS = [
	"mobile-1",
	"mobile-2",
	"mobile-3",
	"mobile-4",
	"mobile-5",
];
const DESKTOP_SKELETON_KEYS = [
	"desktop-1",
	"desktop-2",
	"desktop-3",
	"desktop-4",
	"desktop-5",
	"desktop-6",
	"desktop-7",
];

export function JournalTableSkeleton() {
	return (
		<>
			<div className="space-y-2 md:hidden">
				{MOBILE_SKELETON_KEYS.map((key) => (
					<div key={key} className="surface space-y-3 p-3">
						<div className="flex items-start justify-between gap-3">
							<div className="space-y-2">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-24" />
							</div>
							<Skeleton className="h-5 w-20" />
						</div>
						<Skeleton className="h-10 w-full" />
					</div>
				))}
			</div>
			<div className="surface hidden overflow-hidden md:block">
				<div className="space-y-4 p-4">
					<Skeleton className="h-8 w-full" />
					{DESKTOP_SKELETON_KEYS.map((key) => (
						<Skeleton key={key} className="h-9 w-full" />
					))}
				</div>
			</div>
		</>
	);
}

export interface TradeSelection {
	selectedIds: ReadonlySet<number>;
	onToggle: (tradeId: number) => void;
	onTogglePage: (tradeIds: number[], isSelected: boolean) => void;
}

function SelectCell({
	trade,
	selection,
}: {
	trade: Trade | null;
	selection: TradeSelection;
}) {
	return (
		<TableCell
			className="w-8"
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			{trade && (
				<Checkbox
					checked={selection.selectedIds.has(trade.id)}
					onCheckedChange={() => selection.onToggle(trade.id)}
					aria-label={`Select ${trade.symbol} trade`}
				/>
			)}
		</TableCell>
	);
}

function JournalTableRow({
	row,
	onTradeClick,
	selection,
}: {
	row: Row<JournalRow>;
	onTradeClick?: (trade: Trade) => void;
	selection?: TradeSelection;
}) {
	const entry = row.original;
	const trade = entry.kind === JournalEntryKind.Trade ? entry.trade : null;
	const isClickable = trade !== null && onTradeClick !== undefined;
	const isSelected = trade !== null && selection?.selectedIds.has(trade.id);
	const openTrade = () => {
		if (trade) onTradeClick?.(trade);
	};

	return (
		<TableRow
			className={cn(
				"border-border transition-colors duration-150",
				isSelected && "bg-accent/40",
				trade
					? "cursor-pointer hover:bg-accent/55 focus-visible:bg-accent/55"
					: "bg-muted/35 hover:bg-muted/35",
			)}
			tabIndex={isClickable ? 0 : undefined}
			role={isClickable ? "link" : undefined}
			onClick={openTrade}
			onKeyDown={(event) => {
				if (!isClickable) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					openTrade();
				}
			}}
		>
			{selection && <SelectCell trade={trade} selection={selection} />}
			{row.getVisibleCells().map((cell) => (
				<TableCell key={cell.id}>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	);
}

export interface JournalSortControl {
	current: TradeSort;
	onSortChange: (field: TradeSortField) => void;
}

interface JournalTableProps {
	entries: JournalRow[];
	emptyMessage?: string;
	onTradeClick?: (trade: Trade) => void;
	selection?: TradeSelection;
	sort?: JournalSortControl;
}

const ARIA_SORT = {
	[SortDirection.Asc]: "ascending",
	[SortDirection.Desc]: "descending",
} as const;

const SORT_ICON = {
	[SortDirection.Asc]: ArrowUp,
	[SortDirection.Desc]: ArrowDown,
};

function SortableHead({
	columnId,
	sort,
	children,
}: {
	columnId: string;
	sort?: JournalSortControl;
	children: ReactNode;
}) {
	const column = SORTABLE_COLUMNS[columnId];
	if (!sort || !column) return <TableHead>{children}</TableHead>;
	const direction =
		sort.current.sort === column.field ? sort.current.dir : undefined;
	const Icon = direction ? SORT_ICON[direction] : ArrowUpDown;
	return (
		<TableHead aria-sort={direction && ARIA_SORT[direction]}>
			<div className="flex items-center gap-1">
				{children}
				<button
					type="button"
					aria-label={`Sort by ${column.label}`}
					onClick={() => sort.onSortChange(column.field)}
					className={cn(
						"inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
						direction && "text-foreground",
					)}
				>
					<Icon className="size-3.5" />
				</button>
			</div>
		</TableHead>
	);
}

function SelectPageHead({
	entries,
	selection,
}: {
	entries: JournalRow[];
	selection: TradeSelection;
}) {
	const pageIds = entries.flatMap((entry) =>
		entry.kind === JournalEntryKind.Trade ? [entry.trade.id] : [],
	);
	const selectedOnPage = pageIds.filter((id) =>
		selection.selectedIds.has(id),
	).length;
	let checked: boolean | "indeterminate" = false;
	if (selectedOnPage > 0) checked = "indeterminate";
	if (pageIds.length > 0 && selectedOnPage === pageIds.length) checked = true;
	return (
		<TableHead className="w-8">
			<Checkbox
				checked={checked}
				disabled={!pageIds.length}
				onCheckedChange={() =>
					selection.onTogglePage(pageIds, checked !== true)
				}
				aria-label="Select all trades on this page"
			/>
		</TableHead>
	);
}

export function JournalTable({
	entries,
	emptyMessage = "No entries match this section.",
	onTradeClick,
	selection,
	sort,
}: JournalTableProps) {
	const currency = useCurrency();
	const columns = useMemo(() => journalColumnDefs(currency), [currency]);

	const table = useReactTable({
		data: entries,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<>
			<div className="space-y-2 md:hidden">
				{entries.length ? (
					entries.map((entry) =>
						entry.kind === JournalEntryKind.Trade ? (
							<TradeCard
								key={entry.key}
								trade={entry.trade}
								currency={currency}
							/>
						) : (
							<AdjustmentCard
								key={entry.key}
								adjustment={entry.adjustment}
								currency={currency}
							/>
						),
					)
				) : (
					<div className="empty-field min-h-36 text-sm">{emptyMessage}</div>
				)}
			</div>
			<div className="surface hidden overflow-hidden md:block">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								key={headerGroup.id}
								className="border-border bg-background hover:bg-background"
							>
								{selection && (
									<SelectPageHead entries={entries} selection={selection} />
								)}
								{headerGroup.headers.map((header) => (
									<SortableHead
										key={header.id}
										columnId={header.column.id}
										sort={sort}
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</SortableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length ? (
							table
								.getRowModel()
								.rows.map((row) => (
									<JournalTableRow
										key={row.id}
										row={row}
										onTradeClick={onTradeClick}
										selection={selection}
									/>
								))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length + (selection ? 1 : 0)}
									className="h-36 text-center text-muted-foreground"
								>
									{emptyMessage}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</>
	);
}
