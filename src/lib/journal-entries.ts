import type { AccountEntryRecord } from "./account-entry";

export const JournalEntryKind = {
	Trade: "trade",
	Adjustment: "adjustment",
} as const;

export type JournalEntry<TTrade> =
	| {
			key: string;
			kind: typeof JournalEntryKind.Trade;
			occurredAt: Date;
			trade: TTrade;
	  }
	| {
			key: string;
			kind: typeof JournalEntryKind.Adjustment;
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
				kind: JournalEntryKind.Trade,
				occurredAt: new Date(trade.entryDate),
				trade,
			}),
		),
		...adjustments.map(
			(adjustment): JournalEntry<TTrade> => ({
				key: `adjustment-${adjustment.id}`,
				kind: JournalEntryKind.Adjustment,
				occurredAt: new Date(adjustment.occurredAt),
				adjustment,
			}),
		),
	].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
