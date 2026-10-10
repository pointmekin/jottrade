import { describe, expect, it } from "vitest";
import { TradeSide } from "@/lib/trade";
import {
	readTradeDraft,
	TRADE_DRAFT_MAX_AGE_MS,
	type TradeDraft,
	TradeDraftStatus,
	tradeDraftKey,
	writeTradeDraft,
} from "@/lib/trade-draft";

function storage() {
	const values = new Map<string, string>();
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
}
const NOW = Date.parse("2026-10-10T10:00:00Z");
const draft: TradeDraft = {
	v: 1,
	draftId: "7b0f8a52-61f3-4c1e-9c51-1f6f0f4c2b10",
	savedAt: new Date(NOW).toISOString(),
	values: {
		symbol: "eurusd",
		side: TradeSide.Short,
		entryPrice: "1.1",
		notes: "Waited for the retest.",
		ruleNote: "Planned the size before the open.",
		setupId: 4,
	},
};

describe("trade draft storage", () => {
	it("keys one draft per user and account", () => {
		expect(tradeDraftKey("user:a", 7)).toBe(
			"jottrade.trade-draft.v1:user%3Aa:7",
		);
		expect(tradeDraftKey("user:a", 8)).not.toBe(tradeDraftKey("user:a", 7));
		expect(tradeDraftKey("user:b", 7)).not.toBe(tradeDraftKey("user:a", 7));
	});
	it("reads back the written draft", () => {
		const store = storage();
		writeTradeDraft(store, "key", draft);
		expect(readTradeDraft(store, "key", NOW)).toEqual({
			status: TradeDraftStatus.Ready,
			draft,
		});
	});
	it("returns no draft for a missing key", () => {
		expect(readTradeDraft(storage(), "key", NOW)).toEqual({
			status: TradeDraftStatus.None,
		});
	});
	it("deletes a draft with no change for 30 days", () => {
		const store = storage();
		writeTradeDraft(store, "key", draft);
		expect(
			readTradeDraft(store, "key", NOW + TRADE_DRAFT_MAX_AGE_MS).status,
		).toBe(TradeDraftStatus.Ready);
		expect(
			readTradeDraft(store, "key", NOW + TRADE_DRAFT_MAX_AGE_MS + 1).status,
		).toBe(TradeDraftStatus.None);
		expect(store.values.has("key")).toBe(false);
	});
	it("keeps a value that does not parse", () => {
		const store = storage();
		for (const text of ["{bad json", JSON.stringify({ ...draft, v: 2 })]) {
			store.setItem("key", text);
			expect(readTradeDraft(store, "key", NOW).status).toBe(
				TradeDraftStatus.Unreadable,
			);
			expect(store.getItem("key")).toBe(text);
		}
	});
});
