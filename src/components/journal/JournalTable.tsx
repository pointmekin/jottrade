import { Link } from "@tanstack/react-router";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { useMemo, useState } from "react";
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
import { formatMoney } from "@/lib/currency";

export type Trade = {
	id: number;
	symbol: string;
	side: "LONG" | "SHORT" | string;
	status: string | null;
	entryDate: Date;
	exitDate: Date | null;
	entryPrice: string | null;
	exitPrice: string | null;
	quantity: string | null;
	netPnl: string | null;
	returnPercent: string | null;
	fees?: string | null;
	confidence?: "HIGH" | "MEDIUM" | "LOW" | null;
	mistake?: string | null;
	setupId?: number | null;
	notes?: string | null;
	screenshots?: string[] | null;
};

const buildColumns = (currency: string): ColumnDef<Trade>[] => [
	{
		accessorKey: "entryDate",
		header: "Date",
		cell: ({ row }) => {
			try {
				return format(new Date(row.getValue("entryDate")), "MMM dd, HH:mm");
			} catch (e) {
				return "Invalid Date";
			}
		},
	},
	{
		accessorKey: "symbol",
		header: "Symbol",
		cell: ({ row }) => (
			<span className="font-bold">{row.getValue("symbol")}</span>
		),
	},
	{
		accessorKey: "side",
		header: "Side",
		cell: ({ row }) => {
			const side = row.getValue("side") as string;
			return (
				<span
					className={`status-pill ${side === "LONG" ? "border-success/35 bg-success/10 text-success" : "border-destructive/35 bg-destructive/10 text-destructive"}`}
				>
					{side}
				</span>
			);
		},
	},
	{
		accessorKey: "entryPrice",
		header: `Entry (${currency})`,
		cell: ({ row }) => {
			const val = parseFloat(row.getValue("entryPrice") || "0");
			return formatMoney(val, currency);
		},
	},
	{
		accessorKey: "exitPrice",
		header: `Exit (${currency})`,
		cell: ({ row }) => {
			const valStr = row.getValue("exitPrice");
			if (!valStr) return "-";
			return formatMoney(parseFloat(valStr as string), currency);
		},
	},
	{
		accessorKey: "quantity",
		header: "Qty",
	},
	{
		accessorKey: "exitDate",
		header: "Exit Date",
		cell: ({ row }) => {
			const val = row.getValue("exitDate");
			if (!val) return <span className="text-muted-foreground">—</span>;
			try {
				return format(new Date(val as Date), "MMM dd, HH:mm");
			} catch (e) {
				return "-";
			}
		},
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<span className="text-xs uppercase text-muted-foreground">
				{row.getValue("status")}
			</span>
		),
	},
	{
		accessorKey: "fees",
		header: "Fees",
		cell: ({ row }) => {
			const val = parseFloat(row.getValue("fees") || "0");
			return (
				<span className="text-muted-foreground">
					{val > 0 ? val.toFixed(2) : "—"}
				</span>
			);
		},
	},
	{
		id: "pnl",
		header: `Net P&L (${currency})`,
		cell: ({ row }) => {
			const val = row.original.netPnl;
			if (!val) return <span className="text-muted-foreground">—</span>;
			const num = parseFloat(val);
			const color = num >= 0 ? "text-success" : "text-destructive";
			return (
				<span className={`font-medium ${color}`}>
					{formatMoney(num, currency, { signed: true })}
				</span>
			);
		},
	},
	{
		id: "roi",
		header: "ROI",
		cell: ({ row }) => {
			const val = row.original.returnPercent;
			if (!val) return <span className="text-muted-foreground">—</span>;
			const num = parseFloat(val);
			const color = num >= 0 ? "text-success" : "text-destructive";
			return <span className={`font-medium ${color}`}>{num.toFixed(2)}%</span>;
		},
	},
];

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

interface JournalTableProps {
	data: Trade[];
	onRowClick?: (trade: Trade) => void;
}

function formatTradeDate(value: Date | string | null | undefined) {
	if (!value) return "—";
	try {
		return format(new Date(value), "MMM dd, HH:mm");
	} catch {
		return "Invalid date";
	}
}

function TradeCard({ trade, currency }: { trade: Trade; currency: string }) {
	const netPnl = trade.netPnl ? Number(trade.netPnl) : null;
	const returnPercent = trade.returnPercent
		? Number(trade.returnPercent)
		: null;
	const isLong = trade.side === "LONG";

	return (
		<Link
			to="/journal/$tradeId"
			params={{ tradeId: String(trade.id) }}
			className="surface block min-h-11 p-3 transition-colors hover:bg-accent/45 focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-[3px]"
			aria-label={`Review ${trade.symbol} ${trade.side} trade from ${formatTradeDate(trade.entryDate)}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold tracking-tight text-foreground">
							{trade.symbol}
						</span>
						<span
							className={`status-pill ${isLong ? "border-success/35 bg-success/10 text-success" : "border-destructive/35 bg-destructive/10 text-destructive"}`}
						>
							{trade.side}
						</span>
						<span className="status-pill bg-muted text-muted-foreground">
							{trade.status ?? "—"}
						</span>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{formatTradeDate(trade.entryDate)}
					</p>
				</div>
				<div
					className={`shrink-0 text-right ${netPnl === null ? "text-muted-foreground" : netPnl >= 0 ? "text-success" : "text-destructive"}`}
				>
					<p className="font-data text-sm font-semibold">
						{netPnl === null
							? "—"
							: formatMoney(netPnl, currency, { signed: true })}
					</p>
					<p className="text-xs text-muted-foreground">net P&amp;L</p>
				</div>
			</div>

			<div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2.5">
				<div>
					<p className="text-xs text-muted-foreground">Entry</p>
					<p className="font-data text-xs text-foreground">
						{trade.entryPrice
							? formatMoney(Number(trade.entryPrice), currency)
							: "—"}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Exit</p>
					<p className="font-data text-xs text-foreground">
						{trade.exitPrice
							? formatMoney(Number(trade.exitPrice), currency)
							: "—"}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Qty</p>
					<p className="font-data text-xs text-foreground">
						{trade.quantity || "—"}
					</p>
				</div>
			</div>
			{returnPercent !== null && (
				<p
					className={`mt-2 text-right font-data text-xs font-medium ${returnPercent >= 0 ? "text-success" : "text-destructive"}`}
				>
					{returnPercent >= 0 ? "+" : ""}
					{returnPercent.toFixed(2)}% ROI
				</p>
			)}
		</Link>
	);
}

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

export function JournalTable({ data, onRowClick }: JournalTableProps) {
	const currency = useCurrency();
	const columns = useMemo(() => buildColumns(currency), [currency]);
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "entryDate", desc: true }, // Default sort
	]);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		state: {
			sorting,
		},
	});

	return (
		<>
			<div className="space-y-2 md:hidden">
				{data.length ? (
					data.map((trade) => (
						<TradeCard key={trade.id} trade={trade} currency={currency} />
					))
				) : (
					<div className="empty-field min-h-36 text-sm">
						No trades match this section.
					</div>
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
								{headerGroup.headers.map((header) => {
									return (
										<TableHead key={header.id}>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
									className="cursor-pointer border-border hover:bg-accent/55 focus-visible:bg-accent/55"
									tabIndex={onRowClick ? 0 : undefined}
									role={onRowClick ? "link" : undefined}
									onClick={() => onRowClick?.(row.original)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											onRowClick?.(row.original);
										}
									}}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-36 text-center text-muted-foreground"
								>
									No trades match this section.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</>
	);
}
