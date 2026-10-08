import Papa from "papaparse";
import type { Trade } from "@/lib/trade";

const BOM = "\uFEFF";
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

type ExportContext = {
	accountName: string;
	accountCurrency: string;
	strategyNames: ReadonlyMap<number, string>;
};

type Column = {
	header: string;
	/** Text is user-controlled and gets the formula guard; raw values are database decimals and dates. */
	text: boolean;
	value: (trade: Trade, context: ExportContext) => string | null | undefined;
};

const raw = (header: string, value: Column["value"]): Column => ({
	header,
	text: false,
	value,
});
const text = (header: string, value: Column["value"]): Column => ({
	header,
	text: true,
	value,
});
const iso = (date: Date | null | undefined) => date?.toISOString();

export const TRADE_CSV_COLUMNS: readonly Column[] = [
	raw("trade_id", (trade) => String(trade.id)),
	text("account", (_, context) => context.accountName),
	raw("account_currency", (_, context) => context.accountCurrency),
	text("symbol", (trade) => trade.symbol),
	raw("side", (trade) => trade.side),
	raw("status", (trade) => trade.status),
	raw("entry_time_utc", (trade) => iso(trade.entryDate)),
	raw("exit_time_utc", (trade) => iso(trade.exitDate)),
	raw("entry_price", (trade) => trade.entryPrice),
	raw("exit_price", (trade) => trade.exitPrice),
	raw("quantity", (trade) => trade.quantity),
	raw("fees", (trade) => trade.fees),
	raw("net_pnl", (trade) => trade.netPnl),
	raw("return_percent", (trade) => trade.returnPercent),
	raw("initial_stop_price", (trade) => trade.initialStopPrice),
	raw("initial_target_price", (trade) => trade.initialTargetPrice),
	raw("initial_risk_amount", (trade) => trade.initialRiskAmount),
	raw("initial_risk_percent", (trade) => trade.initialRiskPercent),
	text("strategy", (trade, context) => {
		if (trade.setupId == null) return null;
		return (
			context.strategyNames.get(trade.setupId) ?? `#${trade.setupId} (deleted)`
		);
	}),
	raw("confidence", (trade) => trade.confidence),
	text("mistake", (trade) => trade.mistake),
	text("tags", (trade) => trade.tags?.map((tag) => tag.name).join("; ")),
	text("notes", (trade) => trade.notes),
	raw("reviewed_at_utc", (trade) => iso(trade.reviewedAt)),
	text("broker_source", (trade) => trade.brokerSource),
	text("broker_ticket", (trade) => trade.brokerTicket),
	raw("broker_profit", (trade) => trade.brokerProfit),
	raw("broker_commission", (trade) => trade.brokerCommission),
	raw("broker_swap", (trade) => trade.brokerSwap),
	raw("screenshot_count", (trade) => String(trade.screenshots?.length ?? 0)),
];

/** A leading = + - @ tab or CR makes a spreadsheet run the cell as a formula. */
export function guardFormula(value: string) {
	return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function tradesToCsv(trades: readonly Trade[], context: ExportContext) {
	const data = trades.map((trade) =>
		TRADE_CSV_COLUMNS.map((column) => {
			const value = column.value(trade, context) ?? "";
			return column.text ? guardFormula(value) : value;
		}),
	);
	const fields = TRADE_CSV_COLUMNS.map((column) => column.header);
	return BOM + Papa.unparse({ fields, data }, { newline: "\r\n" });
}

export function slugify(value: string) {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.split("-")
		.filter(Boolean)
		.join("-");
	return slug || "account";
}

export function exportFileName(
	kind: "trades" | "archive",
	accountName: string | null,
	at: Date,
	extension: "csv" | "json",
) {
	const day = at.toISOString().slice(0, 10);
	const parts = ["jottrade", kind];
	if (accountName !== null) parts.push(slugify(accountName));
	return `${[...parts, day].join("-")}.${extension}`;
}
