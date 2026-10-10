// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
	clearUserDrafts,
	reviewDraftKey,
	userDraftKeys,
} from "@/lib/review-draft";
import { tradeDraftKey } from "@/lib/trade-draft";

afterEach(() => localStorage.clear());

describe("user drafts on this device", () => {
	it("deletes only the trade and review drafts of one user", () => {
		const aliceReview = reviewDraftKey("alice", 1, "trade:7");
		const aliceTrade = tradeDraftKey("alice", 2);
		const bobReview = reviewDraftKey("bob", 1, "trade:7");
		const bobTrade = tradeDraftKey("bob", 1);
		const prefixUser = tradeDraftKey("alice2", 1);
		for (const key of [
			aliceReview,
			aliceTrade,
			bobReview,
			bobTrade,
			prefixUser,
			"theme",
		])
			localStorage.setItem(key, "{}");

		expect(userDraftKeys("alice").sort()).toEqual(
			[aliceReview, aliceTrade].sort(),
		);
		clearUserDrafts("alice");

		expect(localStorage.getItem(aliceReview)).toBeNull();
		expect(localStorage.getItem(aliceTrade)).toBeNull();
		expect(localStorage.getItem(bobReview)).toBe("{}");
		expect(localStorage.getItem(bobTrade)).toBe("{}");
		expect(localStorage.getItem(prefixUser)).toBe("{}");
		expect(localStorage.getItem("theme")).toBe("{}");
		expect(userDraftKeys("alice")).toEqual([]);
	});
});
