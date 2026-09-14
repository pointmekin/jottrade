import Papa from "papaparse";

type CsvRow = Record<string, string | undefined>;

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
	note: string;
};

const requiredHeaders = ["Adjustment date", "Adjustment"] as const;

function normalizeHeader(value: string): string {
	return value
		.replace(/^\uFEFF/, "")
		.trim()
		.toLowerCase();
}

function findHeader(fields: string[], expected: string): string | undefined {
	const normalized = normalizeHeader(expected);
	return fields.find((field) => normalizeHeader(field) === normalized);
}

function parseAmount(value: string | undefined): number | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;

	const isParenthesized = /^\(.*\)$/.test(trimmed);
	const normalized = trimmed
		.replace(/[−‐‑‒–—]/g, "-")
		.replace(/[^\d.,+-]/g, "")
		.replace(/,/g, "");
	const parsed = Number(normalized);
	if (!Number.isFinite(parsed) || parsed === 0) return null;
	return isParenthesized ? -Math.abs(parsed) : parsed;
}

function parseAdjustmentDate(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;

	const hasZone = /(Z|UTC|GMT|[+-]\d{2}:?\d{2})$/i.test(trimmed);
	const timestamp = Date.parse(hasZone ? trimmed : `${trimmed} UTC`);
	return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function parseAdjustmentCsv(csv: string): {
	adjustments: ImportedAdjustment[];
	skipped: number;
} {
	const parsed = Papa.parse<CsvRow>(csv, {
		header: true,
		skipEmptyLines: "greedy",
	});

	if (parsed.errors.length > 0) {
		throw new Error("The adjustment CSV could not be read.");
	}

	const fields = parsed.meta.fields ?? [];
	const missing = requiredHeaders.filter(
		(header) => !findHeader(fields, header),
	);
	if (missing.length > 0) {
		throw new Error(`CSV is missing required columns: ${missing.join(", ")}.`);
	}

	const column = (name: string) => findHeader(fields, name);
	const value = (row: CsvRow, name: string) => {
		const key = column(name);
		return key ? (row[key]?.trim() ?? "") : "";
	};

	const adjustments: ImportedAdjustment[] = [];
	let skipped = 0;

	for (const row of parsed.data) {
		const occurredAt = parseAdjustmentDate(value(row, "Adjustment date"));
		const amount = parseAmount(value(row, "Adjustment"));
		if (!occurredAt || amount === null) {
			skipped++;
			continue;
		}

		const symbol = value(row, "Symbol");
		const type = value(row, "Type");
		const lots = value(row, "Lots");
		const positionId = value(row, "Position ID");
		const exDate = value(row, "Ex-date");
		const adjustmentDay = value(row, "Adjustment day");
		const dividendRate = value(row, "Dividend rate");
		const noteParts = [
			symbol,
			type,
			positionId ? `Position ${positionId}` : "",
		].filter(Boolean);

		adjustments.push({
			symbol,
			type,
			lots,
			positionId,
			exDate,
			adjustmentDay,
			occurredAt,
			dividendRate,
			amount,
			note: noteParts.length
				? `${noteParts.join(" · ")} · Exness adjustment`
				: "Exness adjustment",
		});
	}

	return { adjustments, skipped };
}
