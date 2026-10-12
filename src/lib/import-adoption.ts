import { type BrokerRecord, ImportKind } from "./import-batch";
import { recordNet } from "./import-record";
import { subtractImportMoney } from "./import-values";

function equalDecimal(a: string | null, b: string | null): boolean {
	if (a === null || b === null) return a === b;
	return subtractImportMoney(a, b) === "0";
}
export function legacyEconomicFactsMatch(
	a: BrokerRecord,
	b: BrokerRecord,
): boolean {
	if (a.kind !== b.kind || !equalDecimal(recordNet(a), recordNet(b)))
		return false;
	if (a.kind === ImportKind.Trades && b.kind === ImportKind.Trades) {
		return (
			a.symbol === b.symbol &&
			a.side === b.side &&
			a.status === b.status &&
			a.entryDate === b.entryDate &&
			a.exitDate === b.exitDate &&
			equalDecimal(a.entryPrice, b.entryPrice) &&
			equalDecimal(a.exitPrice, b.exitPrice) &&
			equalDecimal(a.quantity, b.quantity)
		);
	}
	if (a.kind === ImportKind.Adjustments && b.kind === ImportKind.Adjustments)
		return a.occurredAt === b.occurredAt && a.entryKind === b.entryKind;
	return false;
}
