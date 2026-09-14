import type { AccountEntryRecord } from "./account-entry";

export type JournalEntry<TTrade> =
	| { key: string; kind: "trade"; occurredAt: Date; trade: TTrade }
	| {
			key: string;
			kind: "adjustment";
			occurredAt: Date;
			adjustment: AccountEntryRecord;
	  };

export function mergeJournalEntries<
	TTrade extends { id: number; entryDate: Date | string },
>(trades: TTrade[], adjustments: AccountEntryRecord[]): JournalEntry<TTrade>[] {
	return [
		...trades.map(
			(trade): JournalEntry<TTrade> => ({
				key: `trade-${trade.id}`,
				kind: "trade",
				occurredAt: new Date(trade.entryDate),
				trade,
			}),
		),
		...adjustments.map(
			(adjustment): JournalEntry<TTrade> => ({
				key: `adjustment-${adjustment.id}`,
				kind: "adjustment",
				occurredAt: new Date(adjustment.occurredAt),
				adjustment,
			}),
		),
	].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
