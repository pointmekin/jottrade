import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { MetricLabel } from "@/components/metric-label";
import { TagList } from "@/components/tags/tag-chip";
import type { AccountEntryRecord } from "@/lib/account-entry";
import { type JournalEntry, JournalEntryKind } from "@/lib/journal-entries";
import { formatEntryDate, toNumber } from "@/lib/journal-format";
import { UNAVAILABLE } from "@/lib/metric";
import type { Trade } from "@/lib/trade";
import { TradeSortField } from "@/lib/trade-sort";
import { AdjustmentPill, Dash, Money, SidePill } from "./journal-cells";

export type JournalRow = JournalEntry<Trade>;

/** One column renders both entry kinds, so trades and adjustments share one grid. */
type JournalColumn = {
	id: string;
	header: string | (() => ReactNode);
	trade: (trade: Trade) => ReactNode;
	adjustment?: (adjustment: AccountEntryRecord) => ReactNode;
};

function PriceReturnHeader() {
	return (
		<MetricLabel label="Price return" className="font-medium">
			<p>
				The move from entry to exit as a percent of the entry price. It is
				positive when the price moved in the trade direction.
			</p>
			<p>
				Fees, leverage, swaps and currency conversion are not in it. The trade
				page also shows the account return.
			</p>
		</MetricLabel>
	);
}

function PriceReturn({ value }: { value: string | null }) {
	const percent = toNumber(value);
	if (percent === null) return <Dash />;
	const color = percent >= 0 ? "text-success" : "text-destructive";
	return <span className={`font-medium ${color}`}>{percent.toFixed(2)}%</span>;
}

const buildColumns = (currency: string): JournalColumn[] => [
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
		id: "tags",
		header: "Tags",
		trade: (trade) => <TagList tags={trade.tags} />,
		adjustment: () => null,
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
				{trade.status ?? UNAVAILABLE}
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
		header: PriceReturnHeader,
		trade: (trade) => <PriceReturn value={trade.returnPercent} />,
	},
];

/** The exit date column sorts by the scope date: closed trades by exit, other trades by entry. */
export const SORTABLE_COLUMNS: Partial<
	Record<string, { field: TradeSortField; label: string }>
> = {
	date: { field: TradeSortField.EntryDate, label: "date" },
	symbol: { field: TradeSortField.Symbol, label: "symbol" },
	exitDate: { field: TradeSortField.ScopeDate, label: "exit date" },
	pnl: { field: TradeSortField.NetPnl, label: "net P&L" },
	roi: { field: TradeSortField.ReturnPercent, label: "price return" },
};

export const journalColumnDefs = (currency: string): ColumnDef<JournalRow>[] =>
	buildColumns(currency).map((column) => ({
		id: column.id,
		header: column.header,
		cell: ({ row }) => {
			const entry = row.original;
			if (entry.kind === JournalEntryKind.Trade)
				return column.trade(entry.trade);
			return column.adjustment?.(entry.adjustment) ?? <Dash />;
		},
	}));
