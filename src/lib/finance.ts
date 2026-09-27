import { resolveQuoteToAccountConversion } from "@/lib/fx";
import { resolveInstrumentSpec } from "@/lib/instruments";
import { TradeSide } from "@/lib/trade";

export function shouldRecalculatePnl(importHash: string | null): boolean {
	return importHash === null;
}

/** Ignores fees, leverage and currency conversion, so imported and manual trades agree. */
export function priceReturnPercent(
	side: TradeSide,
	entryPrice: number,
	exitPrice: number,
): number | null {
	if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice)) return null;
	if (entryPrice === 0) return null;
	const move = ((exitPrice - entryPrice) / entryPrice) * 100;
	return side === TradeSide.Short ? -move : move;
}

export type CalculatePnlInput = {
	side: TradeSide;
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
		side === TradeSide.Long ? exitPrice - entryPrice : entryPrice - exitPrice;
	const grossPnlQuote = priceMove * positionUnits;
	const grossPnlAccount = grossPnlQuote * exitQuoteToAccountRate;
	const netPnlAccount = grossPnlAccount - feesAccount;

	return {
		netPnl: netPnlAccount.toFixed(2),
		returnPercent: (
			priceReturnPercent(side, entryPrice, exitPrice) ?? 0
		).toFixed(2),
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
