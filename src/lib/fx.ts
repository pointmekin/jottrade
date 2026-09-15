export type ConversionContext = {
	baseCurrency: string;
	quoteCurrency: string;
	accountCurrency: string;
	instrumentPrice: number;
};

export type ConversionResolution =
	| { type: "IDENTITY"; rate: 1 }
	| { type: "INSTRUMENT_PRICE"; rate: number }
	| {
			type: "EXTERNAL_REQUIRED";
			fromCurrency: string;
			toCurrency: string;
	  };

export function resolveQuoteToAccountConversion({
	baseCurrency,
	quoteCurrency,
	accountCurrency,
	instrumentPrice,
}: ConversionContext): ConversionResolution {
	const base = baseCurrency.toUpperCase();
	const quote = quoteCurrency.toUpperCase();
	const account = accountCurrency.toUpperCase();

	if (quote === account) return { type: "IDENTITY", rate: 1 };

	if (base === account) {
		if (!Number.isFinite(instrumentPrice) || instrumentPrice <= 0) {
			throw new Error("Instrument price must be a positive number");
		}

		return { type: "INSTRUMENT_PRICE", rate: 1 / instrumentPrice };
	}

	return {
		type: "EXTERNAL_REQUIRED",
		fromCurrency: quote,
		toCurrency: account,
	};
}
