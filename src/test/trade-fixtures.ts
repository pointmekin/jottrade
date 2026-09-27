import type { TradeRecord } from "@/lib/analytics";
import { TradeStatus } from "@/lib/trade";

export const closedTrade = (
	entryISO: string,
	exitISO: string | null,
	netPnl: number,
): TradeRecord => ({
	status: TradeStatus.Closed,
	entryDate: new Date(entryISO),
	exitDate: exitISO ? new Date(exitISO) : null,
	netPnl,
});
