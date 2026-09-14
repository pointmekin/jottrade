import { describe, expect, it } from "vitest";
import { mergeJournalEntries } from "../lib/journal-entries";

describe("journal entry merging", () => {
	it("combines trades and adjustments in reverse chronological order", () => {
		const trades = [
			{ id: 1, entryDate: new Date("2026-09-14T10:00:00Z"), symbol: "XAUUSD" },
			{ id: 2, entryDate: new Date("2026-09-15T10:00:00Z"), symbol: "EURUSD" },
		];
		const adjustments = [
			{
				id: 8,
				occurredAt: "2026-09-15T08:00:00Z",
				amount: -4.5,
				kind: "ADJUSTMENT" as const,
				note: "XAU/USD dividend adjustment",
			},
		];

		expect(
			mergeJournalEntries(trades, adjustments).map((entry) => entry.key),
		).toEqual(["trade-2", "adjustment-8", "trade-1"]);
	});
});
