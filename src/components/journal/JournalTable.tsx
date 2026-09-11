import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { useState } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

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
};

const columns: ColumnDef<Trade>[] = [
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
		header: "Entry",
		cell: ({ row }) => {
			const val = parseFloat(row.getValue("entryPrice") || "0");
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
			}).format(val);
		},
	},
	{
		accessorKey: "exitPrice",
		header: "Exit",
		cell: ({ row }) => {
			const valStr = row.getValue("exitPrice");
			if (!valStr) return "-";
			const val = parseFloat(valStr as string);
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
			}).format(val);
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
		header: "Net P&L",
		cell: ({ row }) => {
			const val = row.original.netPnl;
			if (!val) return <span className="text-muted-foreground">—</span>;
			const num = parseFloat(val);
			const color = num >= 0 ? "text-success" : "text-destructive";
			return (
				<span className={`font-medium ${color}`}>
					{new Intl.NumberFormat("en-US", {
						style: "currency",
						currency: "USD",
					}).format(num)}
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

interface JournalTableProps {
	data: Trade[];
	onRowClick?: (trade: Trade) => void;
}

export function JournalTable({ data, onRowClick }: JournalTableProps) {
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
		<div className="surface overflow-hidden">
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
								className="cursor-pointer border-border hover:bg-accent/55"
								onClick={() => onRowClick?.(row.original)}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
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
	);
}
