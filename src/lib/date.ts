const DATE_LOCALE = "en-US-u-ca-gregory-nu-latn";

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

function partValue(parts: Intl.DateTimeFormatPart[], type: string): string {
	return parts.find((part) => part.type === type)?.value ?? "";
}

export function isValidTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat(DATE_LOCALE, { timeZone });
		return true;
	} catch {
		return false;
	}
}

/** Returns the civil YYYY-MM-DD containing an instant in an IANA timezone. */
export function toDayKey(date: Date, timeZone = "UTC"): string {
	const parts = new Intl.DateTimeFormat(DATE_LOCALE, {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

export function previousDayKey(day: string): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - 1);
	return date.toISOString().slice(0, 10);
}

export function zonedDayOfWeek(date: Date, timeZone: string): number {
	return new Date(`${toDayKey(date, timeZone)}T00:00:00Z`).getUTCDay();
}

export function zonedHour(date: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat(DATE_LOCALE, {
		timeZone,
		hour: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	return Number(partValue(parts, "hour"));
}

/** Formats an instant for a datetime-local input without changing its wall time. */
export function toDateTimeLocalValue(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Converts a browser-local datetime input value into a portable UTC instant. */
export function localDateTimeToIso(value: string): string {
	return new Date(value).toISOString();
}

/** Broker columns explicitly named UTC may omit the otherwise required suffix. */
export function parseUtcDate(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	const normalized = /(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)
		? trimmed
		: `${trimmed.replace(" ", "T")}Z`;
	const parsed = new Date(normalized);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
