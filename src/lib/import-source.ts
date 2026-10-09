import Papa from "papaparse";
import {
	ADJUSTMENT_IMPORT_HEADERS,
	parseAdjustmentRows,
} from "./adjustment-import";
import {
	ImportAction,
	ImportKind,
	type ImportPreviewRow,
} from "./import-batch";
import {
	adjustmentBrokerRecord,
	legacyRecordHash,
	recordFingerprint,
	tradeBrokerRecord,
} from "./import-record";
import { type CsvRow, normalizeImportHeader } from "./import-values";
import { parseTradeRows, TRADE_IMPORT_HEADERS } from "./trade-import";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const IMPORT_TOO_LARGE =
	"This file is larger than 5 MB. Download a shorter date range, then import each file.";
const UPLOAD_UNCHANGED = "Upload the CSV file from Exness without changes.";
export function readImportCsv(csv: string): {
	rows: CsvRow[];
	fields: string[];
} {
	if (new TextEncoder().encode(csv).byteLength > MAX_IMPORT_BYTES)
		throw Error(IMPORT_TOO_LARGE);
	const parsed = Papa.parse<CsvRow>(csv, {
		header: true,
		skipEmptyLines: "greedy",
	});
	const [parseError] = parsed.errors;
	if (parseError?.code === "UndetectableDelimiter")
		throw Error(`This file has only one column. ${UPLOAD_UNCHANGED}`);
	if (parseError)
		throw Error(
			`CSV record ${(parseError.row ?? 0) + 2} could not be read (${parseError.message}). ${UPLOAD_UNCHANGED}`,
		);
	if (!parsed.data.length)
		throw Error(
			"This CSV has no records. Check the account and the date range in Exness, then download the file again.",
		);
	if (parsed.data.length > MAX_IMPORT_ROWS)
		throw Error(
			`This CSV has ${parsed.data.length} records. The limit is ${MAX_IMPORT_ROWS}. Download a shorter date range, then import each file.`,
		);
	const fields = parsed.meta.fields ?? [];
	if (
		parsed.meta.renamedHeaders ||
		new Set(fields.map(normalizeImportHeader)).size !== fields.length
	)
		throw Error("CSV headers must identify each column once.");
	return { rows: parsed.data, fields };
}
function validateAdjustmentCurrency(
	rows: CsvRow[],
	fields: string[],
	sourceCurrency: string,
) {
	const amountColumn = fields.find(
		(field) => normalizeImportHeader(field) === "adjustment",
	);
	for (const row of rows) {
		const suffix = (row[amountColumn ?? ""] ?? "").trim().split(" ").at(-1);
		if (suffix && /^[A-Z]{3}$/.test(suffix) && suffix !== sourceCurrency)
			throw Error(
				"Adjustment currency suffix does not match the selected account.",
			);
	}
}
export async function parseImportSource(
	userId: string,
	portfolioId: number,
	kind: ImportKind,
	sourceCurrency: string,
	rows: CsvRow[],
	fields: string[],
): Promise<ImportPreviewRow[]> {
	const parsed =
		kind === ImportKind.Trades ? parseTradeRows(rows, fields) : null;
	if (parsed && "error" in parsed) throw Error(parsed.error);
	if (parsed?.sourceCurrency && parsed.sourceCurrency !== sourceCurrency)
		throw Error(
			"USD-labeled columns require a USD account and source currency.",
		);
	if (kind === ImportKind.Adjustments)
		validateAdjustmentCurrency(rows, fields, sourceCurrency);
	const tradeRows = parsed && "rows" in parsed ? parsed.rows : null;
	const adjustmentRows =
		kind === ImportKind.Adjustments ? parseAdjustmentRows(rows, fields) : null;
	const accepted =
		kind === ImportKind.Trades
			? TRADE_IMPORT_HEADERS
			: ADJUSTMENT_IMPORT_HEADERS.map(normalizeImportHeader);
	const recognized = fields.filter((field) =>
		accepted.some((name) => name === normalizeImportHeader(field)),
	);
	return Promise.all(
		rows.map(async (rawSource, index) => {
			const source = Object.fromEntries(
				recognized.map((field) => [field, rawSource[field]]),
			);
			const trade = tradeRows?.[index];
			const adjustment = adjustmentRows?.[index];
			let record = null;
			if (trade?.value) record = tradeBrokerRecord(trade.value);
			if (adjustment?.value) record = adjustmentBrokerRecord(adjustment.value);
			return {
				rowNumber: index + 2,
				source,
				issues: trade?.issues ?? adjustment?.issues ?? [],
				record,
				fingerprint: record
					? await recordFingerprint(userId, portfolioId, record)
					: null,
				legacyHash: record ? await legacyRecordHash(userId, record) : null,
				action: record ? ImportAction.Insert : ImportAction.Error,
				reason: record
					? "No identical version is recorded in this account."
					: "Repair or explicitly exclude this row.",
				candidates: [],
				occurrence: 0,
				targetId: null,
				expectedRevision: null,
			};
		}),
	);
}
