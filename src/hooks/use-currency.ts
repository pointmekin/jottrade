import { useAccounts } from "@/hooks/use-accounts";
import { DEFAULT_CURRENCY } from "@/lib/currency";

/** The ISO code every money value on screen is formatted in. */
export function useCurrency(): string {
	const { activeAccount } = useAccounts();
	return activeAccount?.currency ?? DEFAULT_CURRENCY;
}
