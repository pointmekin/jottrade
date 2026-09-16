import { describe, expect, it } from "vitest";
import { matchCommands } from "@/lib/commands/matcher";

describe("local commands", () => {
	it.each([
		[
			"short gold 4550 target 4500 0.01 lot",
			{
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4550",
				targetPrice: "4500",
				quantity: "0.01",
			},
		],
		[
			"short gold 4550 with target 4500, 0.01 lot",
			{
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4550",
				targetPrice: "4500",
				quantity: "0.01",
			},
		],
		[
			"buy eurusd at 1.1735 0.1 lot",
			{ symbol: "EURUSD", side: "LONG", entryPrice: "1.1735", quantity: "0.1" },
		],
		["short gold", { symbol: "XAUUSDM", side: "SHORT" }],
	])("parses %s", (query, params) => {
		expect(matchCommands(query)[0]).toMatchObject({
			intent: { type: "trade", params },
		});
	});
	it.each([
		["deposit 1000", "DEPOSIT", "1000"],
		["deposit $1000", "DEPOSIT", "1000"],
		["add 2000 usd deposit", "DEPOSIT", "2000"],
		["withdraw 250", "WITHDRAWAL", "250"],
	])("parses %s", (query, kind, amount) => {
		expect(matchCommands(query)[0]).toMatchObject({
			intent: { type: "account-entry", params: { kind, amount } },
		});
	});
	it.each(["journal", "journ", "trades", "jrnl"])(
		"matches navigation %s",
		(query) => {
			expect(matchCommands(query)[0]).toMatchObject({
				intent: { type: "navigation", path: "/journal" },
			});
		},
	);
	it("matches themes", () =>
		expect(matchCommands("dark mode")[0]).toMatchObject({
			intent: { type: "theme", theme: "dark" },
		}));
	it("returns commands for empty input and none for unrelated input", () => {
		expect(matchCommands("").length).toBeGreaterThan(5);
		expect(matchCommands("zzzzzzzz")).toEqual([]);
	});
	it("does not silently accept unsupported or malformed trade arguments", () => {
		for (const query of [
			"short gold 4550 stop 4500 0.01 lot",
			"short gold -4550 0.01 lot",
			"short gold 4550 0.01 lot 23",
			"short gold 4550 target nope 0.01 lot",
		]) {
			expect(matchCommands(query)[0]?.confidence ?? 0).toBeLessThan(0.9);
		}
	});
	it("does not discard a negative amount", () => {
		expect(matchCommands("deposit -1000")[0]?.confidence ?? 0).toBeLessThan(
			0.9,
		);
	});
});
