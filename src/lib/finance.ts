import { resolveQuoteToAccountConversion } from "@/lib/fx";
import { resolveInstrumentSpec } from "@/lib/instruments";

export function shouldRecalculatePnl(importHash: string | null): boolean {
	return importHash === null;
}

export type CalculatePnlInput = {
	side: "LONG" | "SHORT";
	entryPrice: number;
	exitPrice: number;
	quantity: number;
	contractSize: number;
	entryQuoteToAccountRate: number;
	exitQuoteToAccountRate: number;
	feesAccount?: number;
};

type CalculateInstrumentPnlInput = Omit<
	CalculatePnlInput,
	"contractSize" | "entryQuoteToAccountRate" | "exitQuoteToAccountRate"
> & {
	symbol: string;
	accountCurrency: string;
};

export function calculatePnL({
	side,
	entryPrice,
	exitPrice,
	quantity,
	contractSize,
	entryQuoteToAccountRate,
	exitQuoteToAccountRate,
	feesAccount = 0,
}: CalculatePnlInput) {
	const inputs = [
		entryPrice,
		exitPrice,
		quantity,
		contractSize,
		entryQuoteToAccountRate,
		exitQuoteToAccountRate,
		feesAccount,
	];
	if (!inputs.every(Number.isFinite)) {
		return { netPnl: "0", returnPercent: "0" };
	}

	const positionUnits = quantity * contractSize;
	const priceMove =
		side === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
	const grossPnlQuote = priceMove * positionUnits;
	const grossPnlAccount = grossPnlQuote * exitQuoteToAccountRate;
	const netPnlAccount = grossPnlAccount - feesAccount;
	const entryNotionalQuote = entryPrice * positionUnits;
	const entryNotionalAccount = entryNotionalQuote * entryQuoteToAccountRate;
	const returnPercent =
		entryNotionalAccount !== 0
			? (netPnlAccount / entryNotionalAccount) * 100
			: 0;

	return {
		netPnl: netPnlAccount.toFixed(2),
		returnPercent: returnPercent.toFixed(2),
	};
}

function resolveLocalConversionRate(
	baseCurrency: string,
	quoteCurrency: string,
	accountCurrency: string,
	instrumentPrice: number,
): number {
	const conversion = resolveQuoteToAccountConversion({
		baseCurrency,
		quoteCurrency,
		accountCurrency,
		instrumentPrice,
	});

	if (conversion.type === "EXTERNAL_REQUIRED") {
		throw new Error(
			`P&L conversion from ${conversion.fromCurrency} to ${conversion.toCurrency} requires an external FX rate.`,
		);
	}

	return conversion.rate;
}

export function calculateInstrumentPnL({
	symbol,
	accountCurrency,
	...input
}: CalculateInstrumentPnlInput) {
	const instrument = resolveInstrumentSpec(symbol);
	if (!instrument.baseCurrency || !instrument.quoteCurrency) {
		return calculatePnL({
			...input,
			contractSize: instrument.contractSize,
			entryQuoteToAccountRate: 1,
			exitQuoteToAccountRate: 1,
		});
	}

	return calculatePnL({
		...input,
		contractSize: instrument.contractSize,
		entryQuoteToAccountRate: resolveLocalConversionRate(
			instrument.baseCurrency,
			instrument.quoteCurrency,
			accountCurrency,
			input.entryPrice,
		),
		exitQuoteToAccountRate: resolveLocalConversionRate(
			instrument.baseCurrency,
			instrument.quoteCurrency,
			accountCurrency,
			input.exitPrice,
		),
	});
}
