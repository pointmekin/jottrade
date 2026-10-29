import Decimal from "decimal.js";
import { resolveInstrumentSpec } from "@/lib/instruments";
import { UNAVAILABLE } from "@/lib/metric";

/** Stored numeric prices have no fixed scale; keep their digits rather than imposing a tick size. */
export function formatInstrumentPrice(
	value: string | number | null | undefined,
	symbol: string,
): string {
	if (value === null || value === undefined || String(value).trim() === "")
		return UNAVAILABLE;
	// Replay averages are binary floats; suppress their arithmetic noise, not stored execution digits.
	const source =
		typeof value === "number" ? value.toPrecision(15) : value.trim();
	try {
		const decimal = new Decimal(source);
		if (!decimal.isFinite()) return UNAVAILABLE;
		const scale =
			typeof value === "string"
				? /^[+-]?\d*\.(\d+)$/.exec(source)?.[1].length
				: undefined;
		const price =
			scale === undefined ? decimal.toFixed() : decimal.toFixed(scale);
		const quote = resolveInstrumentSpec(symbol).quoteCurrency;
		return quote ? `${price} ${quote}` : price;
	} catch {
		return UNAVAILABLE;
	}
}
