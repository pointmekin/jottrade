import Papa from "papaparse";
import {
	type CsvRow,
	importAmount,
	importUtcDate,
	normalizeImportHeader,
	type ParsedImportRow,
} from "./import-values";
export type ImportedAdjustment = {
	symbol: string;
	type: string;
	lots: string;
	positionId: string;
	exDate: string;
	adjustmentDay: string;
	occurredAt: string;
	dividendRate: string;
	amount: number;
	amountDecimal: string;
	note: string;
};
export const ADJUSTMENT_IMPORT_HEADERS = [
	"Symbol",
	"Type",
	"Lots",
	"Position ID",
	"Ex-date",
	"Adjustment day",
	"Adjustment date",
	"Dividend rate",
	"Adjustment",
	"Export warning",
];
const requiredHeaders = ["Adjustment date", "Adjustment"] as const;
export function parseAdjustmentRows(
	rows: CsvRow[],
	fields: string[],
): ParsedImportRow<ImportedAdjustment>[] {
	const column = (name: string) =>
		fields.find(
			(field) => normalizeImportHeader(field) === normalizeImportHeader(name),
		);
	const missing = requiredHeaders.filter((name) => !column(name));
	if (missing.length)
		throw Error(`CSV is missing required columns: ${missing.join(", ")}.`);
	const value = (row: CsvRow, name: string) =>
		row[column(name) ?? ""]?.trim() ?? "";
	return rows.map((row, index) => {
		const issues: ParsedImportRow<ImportedAdjustment>["issues"] = [];
		const occurredAt = importUtcDate(value(row, "Adjustment date"));
		const amount = importAmount(value(row, "Adjustment"));
		if (!occurredAt)
			issues.push({
				column: "Adjustment date",
				message: "Enter a valid UTC date and time.",
			});
		if (amount === null || amount === "0")
			issues.push({
				column: "Adjustment",
				message: "Enter a signed nonzero decimal amount.",
			});
		const symbol = value(row, "Symbol"),
			type = value(row, "Type"),
			positionId = value(row, "Position ID");
		const noteParts = [
			symbol,
			type,
			positionId ? `Position ${positionId}` : "",
		].filter(Boolean);
		const adjustment = {
			symbol,
			type,
			positionId,
			lots: value(row, "Lots"),
			exDate: value(row, "Ex-date"),
			adjustmentDay: value(row, "Adjustment day"),
			occurredAt: occurredAt ?? "",
			dividendRate: value(row, "Dividend rate"),
			amount: Number(amount),
			amountDecimal: amount ?? "0",
			note: noteParts.length
				? `${noteParts.join(" · ")} · Exness adjustment`
				: "Exness adjustment",
		};
		return {
			rowNumber: index + 2,
			source: row,
			issues,
			value: issues.length ? null : adjustment,
		};
	});
}
export function parseAdjustmentCsv(csv: string): {
	adjustments: ImportedAdjustment[];
	skipped: number;
	rows: ParsedImportRow<ImportedAdjustment>[];
} {
	const parsed = Papa.parse<CsvRow>(csv, {
		header: true,
		skipEmptyLines: "greedy",
	});
	if (parsed.errors.length)
		throw Error(
			`The adjustment CSV could not be read: ${parsed.errors[0].message}`,
		);
	const rows = parseAdjustmentRows(parsed.data, parsed.meta.fields ?? []);
	const adjustments = rows.flatMap((row) => (row.value ? [row.value] : []));
	return { adjustments, skipped: rows.length - adjustments.length, rows };
}
