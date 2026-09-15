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
