import Decimal from "decimal.js";

const Money = Decimal.clone({ precision: 48 });
const DECIMAL = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
const MONTHS = [
	"jan",
	"feb",
	"mar",
	"apr",
	"may",
	"jun",
	"jul",
	"aug",
	"sep",
	"oct",
	"nov",
	"dec",
];

export function importDecimal(value: string | undefined): string | null {
	const text = value?.trim();
	if (!text || text.length > 48 || !DECIMAL.test(text)) return null;
	const number = new Money(text.replaceAll(",", ""));
	if (number.decimalPlaces() > 12 || number.abs().gte("1e24")) return null;
	return number.toFixed();
}

export function sumImportMoney(values: string[]): string {
	return values
		.reduce((total, value) => total.plus(value), new Money(0))
		.toFixed();
}

export function subtractImportMoney(a: string, b: string): string {
	return new Money(a).minus(b).toFixed();
}

export function positiveImportDecimal(
	value: string | undefined,
): string | null {
	const parsed = importDecimal(value);
	return parsed !== null && new Money(parsed).gt(0) ? parsed : null;
}

function validCivilDate(year: number, month: number, day: number): boolean {
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

function parseImportTime(value: string): string | null {
	const suffix = /(Z|UTC|GMT|[+-]\d{2}:?\d{2})$/i.exec(value);
	const clock = suffix ? value.slice(0, suffix.index).trim() : value;
	const time = /^(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/.exec(clock);
	if (
		!time ||
		Number(time[1]) > 23 ||
		Number(time[2]) > 59 ||
		Number(time[3] ?? 0) > 59
	)
		return null;
	let zone = suffix?.[0] ?? "Z";
	if (["UTC", "GMT"].includes(zone.toUpperCase())) zone = "Z";
	const fraction = time[4] ? `.${time[4]}` : "";
	return `${time[1]}:${time[2]}:${time[3] ?? "00"}${fraction}${zone}`;
}
export function importUtcDate(value: string | undefined): string | null {
	const text = value?.trim();
	if (!text || text.length > 80) return null;
	const named = /^(\d{1,2}) ([a-z]{3}) (\d{4}) (.+)$/i.exec(text);
	if (named) {
		const month = String(MONTHS.indexOf(named[2].toLowerCase()) + 1).padStart(
			2,
			"0",
		);
		return importUtcDate(
			`${named[3]}-${month}-${named[1].padStart(2, "0")}T${named[4]}`,
		);
	}
	const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](.+)$/.exec(text);
	if (!iso || !validCivilDate(Number(iso[1]), Number(iso[2]), Number(iso[3])))
		return null;
	const time = parseImportTime(iso[4]);
	if (!time) return null;
	const timestamp = Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T${time}`);
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
export function importAmount(value: string | undefined): string | null {
	const text = value?.trim().replaceAll("−", "-");
	if (!text || text.length > 64) return null;
	const pieces = text.split(" ");
	if (/^[A-Z]{3}$/.test(pieces.at(-1) ?? "")) pieces.pop();
	const amount = pieces.join(" ").trim();
	if (amount.startsWith("(") && amount.endsWith(")")) {
		const parsed = importDecimal(amount.slice(1, -1));
		return parsed === null ? null : new Money(parsed).abs().negated().toFixed();
	}
	return importDecimal(amount);
}

export function normalizeImportHeader(value: string): string {
	return value
		.replace(/^\uFEFF/, "")
		.trim()
		.toLowerCase();
}

export function quoteImportColumns(
	names: readonly string[],
	separator = ", ",
): string {
	return names.map((name) => `"${name}"`).join(separator);
}

export const IMPORT_DATE_ISSUE =
	"Enter a UTC date and time, for example 2026-09-01 08:00:00.";

export type ImportRowIssue = { column: string; message: string };
export type CsvRow = Record<string, string | undefined>;
export type ParsedImportRow<T> = {
	rowNumber: number;
	source: CsvRow;
	issues: ImportRowIssue[];
	value: T | null;
};
