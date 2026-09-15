export type InstrumentKind = "FOREX" | "METAL" | "UNIT";

export type QuantityUnit = "LOTS" | "UNITS";

export type InstrumentSpec = {
	symbol: string;
	kind: InstrumentKind;
	quantityUnit: QuantityUnit;
	contractSize: number;
	baseCurrency: string | null;
	quoteCurrency: string | null;
	pipSize: number | null;
};

const FOREX_SYMBOLS = [
	"EURUSD",
	"GBPUSD",
	"USDJPY",
	"USDCHF",
	"USDCAD",
	"AUDUSD",
	"NZDUSD",
	"EURGBP",
	"EURJPY",
	"EURCHF",
	"EURCAD",
	"EURAUD",
	"EURNZD",
	"EURSGD",
	"EURSEK",
	"EURNOK",
	"EURDKK",
	"EURPLN",
	"EURTRY",
	"GBPJPY",
	"GBPCHF",
	"GBPCAD",
	"GBPAUD",
	"GBPNZD",
	"GBPSGD",
	"AUDJPY",
	"AUDCHF",
	"AUDCAD",
	"AUDNZD",
	"AUDSGD",
	"NZDJPY",
	"NZDCHF",
	"NZDCAD",
	"CADJPY",
	"CADCHF",
	"CHFJPY",
	"USDSEK",
	"USDNOK",
	"USDDKK",
	"USDSGD",
	"USDHKD",
	"USDTHB",
	"USDCNH",
	"USDMXN",
	"USDZAR",
	"USDPLN",
	"USDTRY",
	"SGDJPY",
] as const;

function defineForexPair(symbol: string): InstrumentSpec {
	const baseCurrency = symbol.slice(0, 3);
	const quoteCurrency = symbol.slice(3, 6);

	return {
		symbol,
		kind: "FOREX",
		quantityUnit: "LOTS",
		contractSize: 100_000,
		baseCurrency,
		quoteCurrency,
		pipSize: quoteCurrency === "JPY" ? 0.01 : 0.0001,
	};
}

const instrumentRegistry = new Map<string, InstrumentSpec>(
	FOREX_SYMBOLS.map((symbol) => [symbol, defineForexPair(symbol)]),
);

instrumentRegistry.set("XAUUSD", {
	symbol: "XAUUSD",
	kind: "METAL",
	quantityUnit: "LOTS",
	contractSize: 100,
	baseCurrency: "XAU",
	quoteCurrency: "USD",
	pipSize: null,
});

export function normalizeInstrumentSymbol(symbol: string): string {
	return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function resolveInstrumentSpec(symbol: string): InstrumentSpec {
	const normalizedSymbol = normalizeInstrumentSymbol(symbol);
	const exactMatch = instrumentRegistry.get(normalizedSymbol);
	if (exactMatch) return exactMatch;

	for (const [registeredSymbol, spec] of instrumentRegistry) {
		if (normalizedSymbol.startsWith(registeredSymbol)) return spec;
	}

	return {
		symbol: normalizedSymbol,
		kind: "UNIT",
		quantityUnit: "UNITS",
		contractSize: 1,
		baseCurrency: null,
		quoteCurrency: null,
		pipSize: null,
	};
}
