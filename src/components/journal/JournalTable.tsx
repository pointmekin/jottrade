import { Link } from "@tanstack/react-router";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useMemo } from "react";
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
import type { AccountEntryRecord } from "@/lib/account-entry";
import { formatMoney } from "@/lib/currency";
import type { JournalEntry } from "@/lib/journal-entries";

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

type JournalRow = JournalEntry<Trade>;

/**
 * One column renders both entry kinds so trades and adjustments stay in the
 * same grid. A column without an `adjustment` renderer shows a dash instead.
 */
type JournalColumn = {
	id: string;
	header: string;
	trade: (trade: Trade) => ReactNode;
	adjustment?: (adjustment: AccountEntryRecord) => ReactNode;
};

const Dash = () => <span className="text-muted-foreground">—</span>;

function formatEntryDate(value: Date | string | null | undefined) {
	if (!value) return "—";
	try {
		return format(new Date(value), "MMM dd, HH:mm");
	} catch {
		return "Invalid date";
	}
}

function SidePill({ side }: { side: string }) {
	return (
		<span
			className={`status-pill ${side === "LONG" ? "border-success/35 bg-success/10 text-success" : "border-destructive/35 bg-destructive/10 text-destructive"}`}
		>
			{side}
		</span>
	);
}

function AdjustmentPill() {
	return (
		<span className="status-pill border-border bg-muted text-muted-foreground">
			<SlidersHorizontal className="size-3" />
			Adjustment
		</span>
	);
}

function Money({
	value,
	currency,
	signed,
}: {
	value: number | null;
	currency: string;
	signed?: boolean;
}) {
	if (value === null) return <Dash />;
	const color = value >= 0 ? "text-success" : "text-destructive";
	return (
		<span className={`font-data font-medium ${signed ? color : ""}`}>
			{formatMoney(value, currency, { signed })}
		</span>
	);
}

const toNumber = (value: string | null | undefined) =>
	value ? Number(value) : null;

const buildJournalColumns = (currency: string): JournalColumn[] => [
	{
		id: "date",
		header: "Date",
		trade: (trade) => formatEntryDate(trade.entryDate),
		adjustment: (adjustment) => formatEntryDate(adjustment.occurredAt),
	},
	{
		id: "symbol",
		header: "Symbol",
		trade: (trade) => <span className="font-bold">{trade.symbol}</span>,
		adjustment: (adjustment) => (
			<span className="text-muted-foreground">
				{adjustment.note || "Account adjustment"}
			</span>
		),
	},
	{
		id: "side",
		header: "Side",
		trade: (trade) => <SidePill side={trade.side} />,
		adjustment: () => <AdjustmentPill />,
	},
	{
		id: "entryPrice",
		header: `Entry (${currency})`,
		trade: (trade) => (
			<Money value={toNumber(trade.entryPrice)} currency={currency} />
		),
	},
	{
		id: "exitPrice",
		header: `Exit (${currency})`,
		trade: (trade) => (
			<Money value={toNumber(trade.exitPrice)} currency={currency} />
		),
	},
	{
		id: "quantity",
		header: "Qty",
		trade: (trade) => trade.quantity || <Dash />,
	},
	{
		id: "exitDate",
		header: "Exit Date",
		trade: (trade) =>
			trade.exitDate ? formatEntryDate(trade.exitDate) : <Dash />,
	},
	{
		id: "status",
		header: "Status",
		trade: (trade) => (
			<span className="text-xs uppercase text-muted-foreground">
				{trade.status ?? "—"}
			</span>
		),
	},
	{
		id: "fees",
		header: "Fees",
		trade: (trade) => {
			const fees = toNumber(trade.fees);
			if (!fees) return <Dash />;
			return <span className="text-muted-foreground">{fees.toFixed(2)}</span>;
		},
	},
	{
		id: "pnl",
		header: `Net P&L (${currency})`,
		trade: (trade) => (
			<Money value={toNumber(trade.netPnl)} currency={currency} signed />
		),
		adjustment: (adjustment) => (
			<Money value={adjustment.amount} currency={currency} signed />
		),
	},
	{
		id: "roi",
		header: "ROI",
		trade: (trade) => {
			const roi = toNumber(trade.returnPercent);
			if (roi === null) return <Dash />;
			const color = roi >= 0 ? "text-success" : "text-destructive";
			return <span className={`font-medium ${color}`}>{roi.toFixed(2)}%</span>;
		},
	},
];

const toColumnDefs = (columns: JournalColumn[]): ColumnDef<JournalRow>[] =>
	columns.map((column) => ({
		id: column.id,
		header: column.header,
		cell: ({ row }) => {
			const entry = row.original;
			if (entry.kind === "trade") return column.trade(entry.trade);
			return column.adjustment?.(entry.adjustment) ?? <Dash />;
		},
	}));

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

function TradeCard({ trade, currency }: { trade: Trade; currency: string }) {
	const netPnl = toNumber(trade.netPnl);
	const returnPercent = toNumber(trade.returnPercent);

	return (
		<Link
			to="/journal/$tradeId"
			params={{ tradeId: String(trade.id) }}
			className="surface block min-h-11 border-l-2 border-l-ring p-3 transition-colors hover:bg-accent/45 focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-[3px]"
			aria-label={`Review ${trade.symbol} ${trade.side} trade from ${formatEntryDate(trade.entryDate)}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold tracking-tight text-foreground">
							{trade.symbol}
						</span>
						<SidePill side={trade.side} />
						<span className="status-pill bg-muted text-muted-foreground">
							{trade.status ?? "—"}
						</span>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{formatEntryDate(trade.entryDate)}
					</p>
				</div>
				<div className="shrink-0 text-right">
					<p className="text-sm">
						<Money value={netPnl} currency={currency} signed />
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

function AdjustmentCard({
	adjustment,
	currency,
}: {
	adjustment: AccountEntryRecord;
	currency: string;
}) {
	return (
		<div className="surface block min-h-11 border-l-2 border-l-border bg-muted/35 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold tracking-tight text-foreground">
							Account adjustment
						</span>
						<AdjustmentPill />
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{formatEntryDate(adjustment.occurredAt)}
					</p>
				</div>
				<div className="shrink-0 text-right">
					<p className="text-sm">
						<Money value={adjustment.amount} currency={currency} signed />
					</p>
					<p className="text-xs text-muted-foreground">balance change</p>
				</div>
			</div>
			{adjustment.note && (
				<p className="mt-3 truncate border-t border-border pt-2.5 text-xs text-muted-foreground">
					{adjustment.note}
				</p>
			)}
		</div>
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
	const columns = useMemo(
		() => toColumnDefs(buildJournalColumns(currency)),
		[currency],
	);

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
						entry.kind === "trade" ? (
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
							table.getRowModel().rows.map((row) => {
								const entry = row.original;
								const isTrade = entry.kind === "trade";
								const openTrade = () => {
									if (isTrade) onTradeClick?.(entry.trade);
								};
								const isClickable = isTrade && Boolean(onTradeClick);

								return (
									<TableRow
										key={row.id}
										className={
											isTrade
												? "cursor-pointer border-border border-l-2 border-l-ring hover:bg-accent/55 focus-visible:bg-accent/55"
												: "border-border border-l-2 border-l-border bg-muted/35 hover:bg-muted/35"
										}
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
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</TableCell>
										))}
									</TableRow>
								);
							})
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
