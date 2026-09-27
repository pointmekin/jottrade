import { parseUtcDate } from "./date";

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
	netPnl: string;
	notes: string;
};

export type CsvRow = Record<string, string | undefined>;

// Exness names the money columns `profit`/`commission`/`swap`; some MT4/5
// exports suffix them with `_usd`. Both spellings map to the same field.
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

function resolveColumns(fields: string[]): ColumnMap {
	const present = new Set(fields.map((f) => f.trim().toLowerCase()));
	const resolved: ColumnMap = {};
	for (const key of Object.keys(COLUMN_ALIASES) as ColumnKey[]) {
		const match = COLUMN_ALIASES[key].find((alias) => present.has(alias));
		if (match) resolved[key] = match;
	}
	return resolved;
}

/** Exness leaves a numeric cell empty to mean zero, so a blank is not an error. */
function parseNumber(value: string | undefined): number | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const parsed = Number(trimmed.replace(/[\s,]/g, ""));
	return Number.isFinite(parsed) ? parsed : null;
}

function toImportedTrade(
	row: CsvRow,
	columns: ColumnMap,
): ImportedTrade | null {
	const cell = (key: ColumnKey) => {
		const column = columns[key];
		return column ? row[column] : undefined;
	};
	const ticket = cell("ticket")?.trim();
	const symbol = cell("symbol")?.trim();
	const side = cell("type")?.trim();
	const entryDate = parseUtcDate(cell("openingTime"));
	const entryPrice = parseNumber(cell("openingPrice"));
	const quantity = parseNumber(cell("lots"));
	if (!ticket || !symbol || !side) return null;
	if (!entryDate || entryPrice === null || quantity === null) return null;

	const profit = parseNumber(cell("profit")) ?? 0;
	const commission = parseNumber(cell("commission")) ?? 0;
	const swap = parseNumber(cell("swap")) ?? 0;
	// The broker reports profit gross of costs; commission and swap arrive signed.
	const netPnl = profit + commission + swap;
	const fees = Math.abs(commission) + Math.abs(swap);

	return {
		ticket,
		symbol,
		side,
		entryDate,
		entryPrice: String(entryPrice),
		quantity: String(quantity),
		exitDate: parseUtcDate(cell("closingTime")),
		exitPrice: parseNumber(cell("closingPrice"))?.toString(),
		fees: fees.toFixed(2),
		netPnl: netPnl.toFixed(2),
		notes: `Ticket: ${ticket} | Reason: ${cell("closeReason")?.trim() || "N/A"}`,
	};
}

export type TradeCsvResult =
	| { error: string }
	| { trades: ImportedTrade[]; skipped: number };

export function parseTradeRows(
	rows: CsvRow[],
	fields: string[],
): TradeCsvResult {
	const columns = resolveColumns(fields);
	const missing = REQUIRED_COLUMNS.filter((key) => !columns[key]);
	if (missing.length > 0) {
		const names = missing
			.map((key) => COLUMN_ALIASES[key].join(" or "))
			.join(", ");
		return { error: `CSV is missing required columns: ${names}.` };
	}

	const trades = rows
		.map((row) => toImportedTrade(row, columns))
		.filter((trade): trade is ImportedTrade => trade !== null);
	if (trades.length === 0) {
		return { error: "No valid trades found in CSV. Check format." };
	}
	// A profit column that is blank on every row means the wrong export
	// variant. Importing it would silently flatten the equity curve.
	if (trades.every((trade) => Number(trade.netPnl) === 0)) {
		return {
			error: `Every row has zero P&L. Check that the "${columns.profit}" column holds values.`,
		};
	}
	return { trades, skipped: rows.length - trades.length };
}
