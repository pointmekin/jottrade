export const DEFAULT_CURRENCY = "USD";

/** Codes offered in Settings. Any ISO 4217 code still formats correctly. */
export const SUPPORTED_CURRENCIES = [
	"USD",
	"EUR",
	"GBP",
	"JPY",
	"AUD",
	"CAD",
	"CHF",
	"SGD",
	"HKD",
	"THB",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

type FormatOptions = {
	signed?: boolean;
	maximumFractionDigits?: number;
};

// Intl rejects an unknown code by throwing, so bad stored data must not break a page.
function safeFormatter(currency: string, options: Intl.NumberFormatOptions) {
	try {
		return new Intl.NumberFormat("en-US", { ...options, currency });
	} catch {
		return new Intl.NumberFormat("en-US", {
			...options,
			currency: DEFAULT_CURRENCY,
		});
	}
}

export function formatMoney(
	value: number,
	currency: string = DEFAULT_CURRENCY,
	{ signed = false, maximumFractionDigits = 2 }: FormatOptions = {},
): string {
	return safeFormatter(currency, {
		style: "currency",
		currencyDisplay: "narrowSymbol",
		minimumFractionDigits: Math.min(2, maximumFractionDigits),
		maximumFractionDigits,
		signDisplay: signed ? "always" : "auto",
	}).format(value);
}

/** Amount plus the explicit ISO code, for headline figures that must be unambiguous. */
export function formatMoneyWithCode(
	value: number,
	currency: string = DEFAULT_CURRENCY,
	options?: FormatOptions,
): string {
	return `${formatMoney(value, currency, options)} ${currency}`;
}

export function currencySymbol(currency: string = DEFAULT_CURRENCY): string {
	const parts = safeFormatter(currency, {
		style: "currency",
		currencyDisplay: "narrowSymbol",
	}).formatToParts(0);
	return parts.find((part) => part.type === "currency")?.value ?? currency;
}
