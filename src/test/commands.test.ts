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
		[
			"short gold 4500 , 0.01 lot size",
			{
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4500",
				quantity: "0.01",
			},
		],
		[
			"short gold entry 4550 tp 4500 lot size 0.01",
			{
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4550",
				targetPrice: "4500",
				quantity: "0.01",
			},
		],
		[
			"sell xauusd @ 4550 take profit 4500 size 0.01",
			{
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4550",
				targetPrice: "4500",
				quantity: "0.01",
			},
		],
		[
			"buy eurusd at 1.1735 qty 0.1 target price 1.18",
			{
				symbol: "EURUSD",
				side: "LONG",
				entryPrice: "1.1735",
				targetPrice: "1.18",
				quantity: "0.1",
			},
		],
		[
			"i want to short gold at 4500 entyr price, target 4400, 0.01 lot size",
			{
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4500",
				targetPrice: "4400",
				quantity: "0.01",
			},
		],
		[
			"shrot gold 4500 4400 0.01 lot",
			{
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4500",
				targetPrice: "4400",
				quantity: "0.01",
			},
		],
		[
			"log a long eurusd 1.1735 1.19 0.1 lto",
			{
				symbol: "EURUSD",
				side: "LONG",
				entryPrice: "1.1735",
				targetPrice: "1.19",
				quantity: "0.1",
			},
		],
		[
			"short gold entry 4500 4400 0.01 lot",
			{
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4500",
				targetPrice: "4400",
				quantity: "0.01",
			},
		],
	])("parses %s", (query, params) => {
		expect(matchCommands(query)[0]).toMatchObject({
			intent: { type: "trade", params },
		});
	});
	it.each([
		"i want to short gold at 4500 entyr price, target 4400, 0.01 lot size",
		"shrot gold 4500 4400 0.01 lto",
		"sell gold taget 4400 entry 4500 0.01 lots",
		"short gold price 4500 target 4400 0.01 lot",
	])("needs no confirmation prompt for %s", (query) => {
		expect(matchCommands(query)[0]?.confidence).toBeGreaterThan(0.9);
		expect(matchCommands(query)[0]?.warning).toBeUndefined();
	});
	it.each([
		"short gold 4500 5000 0.01 lot",
		"long gold 4500 4000 0.01 lot",
		"short gold 4500 23 0.01 lot",
	])("does not read an implausible second price as a target: %s", (query) => {
		expect(matchCommands(query)[0]?.confidence ?? 0).toBeLessThan(0.9);
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
