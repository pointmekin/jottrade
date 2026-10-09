import {
	IMPORT_DATE_ISSUE,
	importDecimal,
	importUtcDate,
	normalizeImportHeader,
	type ParsedImportRow,
	positiveImportDecimal,
	quoteImportColumns,
	subtractImportMoney,
	sumImportMoney,
} from "./import-values";

export type { CsvRow } from "./import-values";

import type { CsvRow } from "./import-values";

export type ImportedTrade = {
	ticket: string;
	symbol: string;
	side: string;
	entryDate: string;
	entryPrice: string;
	quantity: string;
	exitDate?: string;
	exitPrice?: string;
	fees: string;
	netPnl?: string;
	profit?: string;
	commission: string;
	swap: string;
	closeReason: string;
	notes: string;
};
const COLUMN_ALIASES = {
	ticket: ["ticket"],
	symbol: ["symbol"],
	type: ["type"],
	lots: ["lots"],
	openingTime: ["opening_time_utc"],
	closingTime: ["closing_time_utc"],
	openingPrice: ["opening_price"],
	closingPrice: ["closing_price"],
	profit: ["profit", "profit_usd"],
	commission: ["commission", "commission_usd"],
	swap: ["swap", "swap_usd"],
	closeReason: ["close_reason"],
} as const;
export const TRADE_IMPORT_HEADERS = Object.values(COLUMN_ALIASES).flat();
const DOWNLOAD_AGAIN =
	"Download the trade CSV again from Exness History of orders.";

type ColumnKey = keyof typeof COLUMN_ALIASES;
type ColumnMap = Partial<Record<ColumnKey, string>>;
const REQUIRED_COLUMNS: ColumnKey[] = [
	"ticket",
	"symbol",
	"type",
	"lots",
	"openingTime",
	"openingPrice",
	"profit",
];
export const TRADE_REQUIRED_HEADERS = REQUIRED_COLUMNS.map(
	(key) => COLUMN_ALIASES[key][0],
);
function resolveColumns(fields: string[]): ColumnMap {
	const resolved: ColumnMap = {};
	for (const key of Object.keys(COLUMN_ALIASES) as ColumnKey[]) {
		const field = fields.find((name) =>
			COLUMN_ALIASES[key].some(
				(alias) => alias === normalizeImportHeader(name),
			),
		);
		if (field) resolved[key] = field;
	}
	return resolved;
}
function readTrade(
	row: CsvRow,
	columns: ColumnMap,
	rowNumber: number,
): ParsedImportRow<ImportedTrade> {
	const issues: ParsedImportRow<ImportedTrade>["issues"] = [];
	const cell = (key: ColumnKey) => row[columns[key] ?? ""]?.trim() ?? "";
	const requiredText = (key: ColumnKey) => {
		const value = cell(key);
		if (!value)
			issues.push({
				column: columns[key] ?? key,
				message: "A value is required.",
			});
		return value;
	};
	const number = (key: ColumnKey, positive = false) => {
		const parsed = positive
			? positiveImportDecimal(cell(key))
			: importDecimal(cell(key));
		if (parsed === null)
			issues.push({
				column: columns[key] ?? key,
				message: positive
					? "Enter a number above 0, for example 0.10."
					: "Enter a decimal amount, including 0 for breakeven.",
			});
		return parsed ?? "0";
	};
	const date = (key: ColumnKey) => {
		const parsed = importUtcDate(cell(key));
		if (!parsed)
			issues.push({
				column: columns[key] ?? key,
				message: IMPORT_DATE_ISSUE,
			});
		return parsed ?? "";
	};
	const ticket = requiredText("ticket");
	const symbol = requiredText("symbol").toUpperCase();
	const side = requiredText("type").toLowerCase();
	if (side && !["buy", "sell"].includes(side))
		issues.push({
			column: columns.type ?? "type",
			message: `"${side}" is not a supported type. Only buy and sell trades import. Exclude this row.`,
		});
	const entryDate = date("openingTime");
	const entryPrice = number("openingPrice", true);
	const quantity = number("lots", true);
	const closed = Boolean(cell("closingTime") || cell("closingPrice"));
	const exitDate = closed ? date("closingTime") : undefined;
	const exitPrice = closed ? number("closingPrice", true) : undefined;
	if (exitDate && entryDate && exitDate < entryDate)
		issues.push({
			column: columns.closingTime ?? "closing_time_utc",
			message: "Closing time cannot precede opening time.",
		});
	const profit = closed || cell("profit") ? number("profit") : undefined;
	const cost = (key: "commission" | "swap") => {
		if (!columns[key])
			issues.push({
				column: key,
				message:
					"This export omitted the cost column. Supply a verified signed amount, including 0 when there was no cost.",
			});
		return cell(key) ? number(key) : "0";
	};
	const commission = cost("commission");
	const swap = cost("swap");
	const netPnl =
		profit === undefined
			? undefined
			: sumImportMoney([profit, commission, swap]);
	const fees = subtractImportMoney("0", sumImportMoney([commission, swap]));
	const closeReason = cell("closeReason");
	const value = {
		ticket,
		symbol,
		side,
		entryDate,
		entryPrice,
		quantity,
		exitDate,
		exitPrice,
		profit,
		commission,
		swap,
		netPnl,
		fees,
		closeReason,
		notes: `Ticket: ${ticket} | Reason: ${closeReason || "N/A"}`,
	};
	return {
		rowNumber,
		source: row,
		issues,
		value: issues.length ? null : value,
	};
}
export type TradeCsvResult =
	| { error: string }
	| {
			trades: ImportedTrade[];
			skipped: number;
			rows: ParsedImportRow<ImportedTrade>[];
			sourceCurrency: string | null;
	  };
export function parseTradeRows(
	rows: CsvRow[],
	fields: string[],
): TradeCsvResult {
	const duplicate = (Object.keys(COLUMN_ALIASES) as ColumnKey[])
		.map((key) =>
			fields.filter((field) =>
				COLUMN_ALIASES[key].some(
					(alias) => alias === normalizeImportHeader(field),
				),
			),
		)
		.find((matches) => matches.length > 1);
	if (duplicate)
		return {
			error: `Only one of these columns can be in the file: ${quoteImportColumns(duplicate)}. Remove one of them, then upload the file again.`,
		};
	const columns = resolveColumns(fields);
	const missing = REQUIRED_COLUMNS.filter((key) => !columns[key]);
	if (missing.length === REQUIRED_COLUMNS.length)
		return {
			error:
				"This file is not an Exness trade history CSV. Download the trade CSV from Exness History of orders. For an adjustment file, use the Adjustment CSV tab.",
		};
	if (missing.length)
		return {
			error: `Missing columns: ${missing.map((key) => quoteImportColumns(COLUMN_ALIASES[key], " or ")).join(", ")}. ${DOWNLOAD_AGAIN}`,
		};
	const parsed = rows.map((row, index) => readTrade(row, columns, index + 2));
	const trades = parsed.flatMap((row) => (row.value ? [row.value] : []));
	return {
		trades,
		skipped: rows.length - trades.length,
		rows: parsed,
		sourceCurrency: fields.some((field) =>
			normalizeImportHeader(field).endsWith("_usd"),
		)
			? "USD"
			: null,
	};
}
