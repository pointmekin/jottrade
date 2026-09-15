type QuantityDisplayInput = {
	quantity?: string | null;
	quantityUnit?: string | null;
	contractSize?: string | null;
};

export function getQuantityDisplay({
	quantity,
	quantityUnit,
	contractSize,
}: QuantityDisplayInput) {
	if (!quantity) return { quantity: "—", positionUnits: null };
	const unit =
		quantityUnit === "LOTS"
			? "lots"
			: quantityUnit === "UNITS"
				? "units"
				: null;
	const numericQuantity = Number(quantity);
	const numericContractSize = Number(contractSize);
	const positionUnits =
		unit &&
		Number.isFinite(numericQuantity) &&
		Number.isFinite(numericContractSize) &&
		numericContractSize > 0
			? new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(
					numericQuantity * numericContractSize,
				)
			: null;

	return {
		quantity: unit ? `${quantity} ${unit}` : quantity,
		positionUnits,
	};
}

type ConversionDisplayInput = {
	quoteCurrency?: string | null;
	pnlCurrency?: string | null;
	entryConversionSource?: string | null;
	exitConversionRate?: string | null;
	exitConversionSource?: string | null;
};

type TradeConversionDisplay =
	| { source: "Broker reported" }
	| {
			pnlCurrency: string;
			accountCurrency: string;
			pair: string;
			rate: string;
			source: string;
	  }
	| null;

export function getTradeConversionDisplay(
	input: ConversionDisplayInput,
): TradeConversionDisplay {
	if (
		input.entryConversionSource === "BROKER_REPORTED" ||
		input.exitConversionSource === "BROKER_REPORTED"
	) {
		return { source: "Broker reported" } as const;
	}
	if (
		!input.quoteCurrency ||
		!input.pnlCurrency ||
		!input.exitConversionRate ||
		!input.exitConversionSource ||
		input.exitConversionSource === "IDENTITY"
	) {
		return null;
	}

	const sources: Record<string, string> = {
		INSTRUMENT_PRICE: "Instrument price at exit",
		TWELVE_DATA: "Twelve Data",
		FRANKFURTER: "Frankfurter daily reference rate",
	};
	const source = sources[input.exitConversionSource];
	if (!source) return null;
	const pnlCurrency = input.quoteCurrency;
	const accountCurrency = input.pnlCurrency;

	return {
		pnlCurrency,
		accountCurrency,
		pair: `${pnlCurrency} → ${accountCurrency}`,
		rate: input.exitConversionRate,
		source,
	};
}
