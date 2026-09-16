const instrumentAliases: Record<string, string> = {
	gold: "XAUUSDM",
	xau: "XAUUSDM",
	xauusd: "XAUUSDM",
};
export function resolveCommandSymbol(symbol: string): string {
	return instrumentAliases[symbol.toLowerCase()] ?? symbol.toUpperCase();
}
