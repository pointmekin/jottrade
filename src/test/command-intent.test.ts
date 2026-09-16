import { describe, expect, it } from "vitest";
import {
	extractedIntentSchema,
	intentJsonSchema,
	toCommandCandidate,
} from "@/lib/commands/intent-schema";

function parse(value: unknown) {
	return extractedIntentSchema.safeParse(value);
}

describe("extracted intent schema", () => {
	it("accepts a complete trade intent", () => {
		const result = parse({
			intent: "trade",
			symbol: "gold",
			side: "SHORT",
			entryPrice: "4550",
			quantity: "0.01",
			targetPrice: "4500",
		});
		expect(result.success).toBe(true);
	});

	it.each([
		["an unsupported intent", { intent: "delete-account" }],
		["an unsupported route", { intent: "navigation", path: "/admin" }],
		[
			"a signed amount",
			{ intent: "account-entry", kind: "DEPOSIT", amount: "-5" },
		],
		[
			"a formatted amount",
			{ intent: "account-entry", kind: "DEPOSIT", amount: "1,000" },
		],
		[
			"an unsupported entry kind",
			{ intent: "account-entry", kind: "ADJUSTMENT" },
		],
		["an unsupported theme", { intent: "theme", theme: "neon" }],
		["a non-price entry", { intent: "trade", entryPrice: "about 4550" }],
	])("rejects %s", (_label, value) => {
		expect(parse(value).success).toBe(false);
	});

	it("constrains the model schema to the supported routes and intents", () => {
		expect(intentJsonSchema.properties.path.enum).toEqual([
			"/dashboard",
			"/journal",
			"/calendar",
			"/strategies",
			"/settings",
		]);
		expect(intentJsonSchema.properties.intent.enum).toContain("unknown");
		expect(intentJsonSchema.properties.kind.enum).not.toContain("ADJUSTMENT");
	});
});

describe("intent to candidate", () => {
	it("keeps the quantity as lots and resolves the instrument alias", () => {
		const candidate = toCommandCandidate({
			intent: "trade",
			symbol: "gold",
			side: "SHORT",
			entryPrice: "4550",
			quantity: "0.01",
			targetPrice: "4500",
		});
		expect(candidate?.intent).toEqual({
			type: "trade",
			params: {
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4550",
				quantity: "0.01",
				targetPrice: "4500",
			},
		});
		expect(candidate?.warning).toMatch(/Gemini/);
	});

	it("keeps missing trade fields empty instead of inventing them", () => {
		const candidate = toCommandCandidate({ intent: "trade", symbol: "eurusd" });
		expect(candidate?.intent).toEqual({
			type: "trade",
			params: {
				symbol: "EURUSD",
				side: undefined,
				entryPrice: undefined,
				quantity: undefined,
				targetPrice: undefined,
			},
		});
	});

	it("maps a withdrawal and normalizes the currency", () => {
		const candidate = toCommandCandidate({
			intent: "account-entry",
			kind: "WITHDRAWAL",
			amount: "500",
			currency: "usd",
		});
		expect(candidate?.id).toBe("withdrawal");
		expect(candidate?.intent).toEqual({
			type: "account-entry",
			params: { kind: "WITHDRAWAL", amount: "500", currency: "USD" },
		});
	});

	it("maps navigation and theme intents", () => {
		expect(
			toCommandCandidate({ intent: "navigation", path: "/journal" })?.intent,
		).toEqual({ type: "navigation", path: "/journal" });
		expect(
			toCommandCandidate({ intent: "theme", theme: "system" })?.intent,
		).toEqual({ type: "theme", theme: "system" });
	});

	it.each([
		["unknown", { intent: "unknown" as const }],
		["navigation without a route", { intent: "navigation" as const }],
		["an account entry without a kind", { intent: "account-entry" as const }],
		["a theme without a value", { intent: "theme" as const }],
	])("returns no candidate for %s", (_label, value) => {
		expect(toCommandCandidate(value)).toBeNull();
	});
});
