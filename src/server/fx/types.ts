export type FxProvider = "twelve_data" | "frankfurter";
export type FxRateMode = "HISTORICAL" | "CURRENT";
export type FxRatePrecision = "INTRADAY" | "DAILY";

export type FxRateResult = {
	fromCurrency: string;
	toCurrency: string;
	rate: number;
	provider: FxProvider;
	asOf: Date;
	precision: FxRatePrecision;
};

export type ResolveFxRateInput = {
	fromCurrency: string;
	toCurrency: string;
	at: Date;
	mode: FxRateMode;
};
