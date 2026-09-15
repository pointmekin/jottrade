const CURRENCY_LOCK_MESSAGE =
	"Account currency cannot be changed after account activity exists.\nCreate another account if you need a different account currency.";

type CurrencyChangeInput = {
	currentCurrency: string;
	nextCurrency: string;
	tradeCount: number;
	cashFlowCount: number;
};

export function assertCurrencyChangeAllowed({
	currentCurrency,
	nextCurrency,
	tradeCount,
	cashFlowCount,
}: CurrencyChangeInput): void {
	if (currentCurrency.toUpperCase() === nextCurrency.toUpperCase()) return;
	if (tradeCount > 0 || cashFlowCount > 0) {
		throw new Error(CURRENCY_LOCK_MESSAGE);
	}
}
