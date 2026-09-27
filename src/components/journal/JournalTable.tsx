import {
	flexRender,
	getCoreRowModel,
	type Row,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
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
import { cn } from "@/lib/utils";
import { type JournalRow, journalColumnDefs } from "./journal-columns";
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

function JournalTableRow({
	row,
	onTradeClick,
}: {
	row: Row<JournalRow>;
	onTradeClick?: (trade: Trade) => void;
}) {
	const entry = row.original;
	const trade = entry.kind === JournalEntryKind.Trade ? entry.trade : null;
	const isClickable = trade !== null && onTradeClick !== undefined;
	const openTrade = () => {
		if (trade) onTradeClick?.(trade);
	};

	return (
		<TableRow
			className={cn(
				"border-border",
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
			{row.getVisibleCells().map((cell) => (
				<TableCell key={cell.id}>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	);
}

interface JournalTableProps {
	entries: JournalRow[];
	emptyMessage?: string;
	onTradeClick?: (trade: Trade) => void;
}

export function JournalTable({
	entries,
	emptyMessage = "No entries match this section.",
	onTradeClick,
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
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
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
									/>
								))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
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
