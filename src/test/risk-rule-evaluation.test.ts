import { describe, expect, it } from "vitest";
import { AccountEntryKind } from "@/lib/account-entry";
import { zonedDayStart } from "@/lib/date";
import {
	buildRuleContext,
	evaluateEntry,
	RiskRuleKind,
	type RuleHistory,
	RuleOutcome,
	ruleEntryOf,
} from "@/lib/risk-rule-evaluation";
import { DailyLossUnit, type RiskRules } from "@/lib/risk-rules";
import { TradeSide, TradeStatus } from "@/lib/trade";
import type { TradeCaptureValues } from "@/lib/trade-capture";
import { RiskUnavailableReason } from "@/lib/trade-risk-schema";

const SINCE = new Date("2026-01-01T00:00:00Z");

const version = (
	rules: Omit<RiskRules, "v">,
	timezone = "UTC",
	effectiveFrom = SINCE,
	number = 1,
) => ({
	version: number,
	rules: { v: 1 as const, ...rules },
	timezone,
	effectiveFrom,
});

const closed = (
	exitISO: string | null,
	netPnl: number | null,
	entryISO = exitISO ?? "2026-01-02T00:00:00Z",
) => ({
	status: TradeStatus.Closed,
	entryDate: new Date(entryISO),
	exitDate: exitISO ? new Date(exitISO) : null,
	netPnl,
});

const open = (entryISO: string) => ({
	status: TradeStatus.Open,
	entryDate: new Date(entryISO),
	exitDate: null,
	netPnl: null,
});

const deposit = (occurredISO: string, amount: number) => ({
	occurredAt: new Date(occurredISO),
	amount,
	kind: AccountEntryKind.Deposit,
});

// EURUSD, 1 lot, 0.01 stop distance: 1,000 USD of initial risk.
const capture = (
	entryDate: string,
	patch: Partial<TradeCaptureValues> = {},
): TradeCaptureValues => ({
	symbol: "EURUSD",
	side: TradeSide.Long,
	entryPrice: "1.1",
	quantity: "1",
	entryDate,
	initialStopPrice: "1.09",
	balanceAccount: "10000",
	...patch,
});

function check(
	history: Partial<RuleHistory>,
	entryDate: string,
	patch: Partial<TradeCaptureValues> = {},
) {
	const context = buildRuleContext(
		{ versions: [], currency: "USD", trades: [], cashFlows: [], ...history },
		new Date(entryDate),
	);
	return evaluateEntry(context, ruleEntryOf(capture(entryDate, patch), "USD"));
}

const outcomeOf = (
	result: ReturnType<typeof check>,
	kind: (typeof RiskRuleKind)[keyof typeof RiskRuleKind],
) => result.outcomes.find((item) => item.kind === kind);

describe("rule version in effect", () => {
	it("gives NotSet for every rule with no version", () => {
		const result = check({}, "2026-03-02T10:00:00Z");
		expect(result.version).toBeNull();
		expect(result.outcomes.map((item) => item.outcome)).toEqual(
			Object.values(RiskRuleKind).map(() => RuleOutcome.NotSet),
		);
	});

	it("does not apply a version to an entry before its start", () => {
		const result = check(
			{
				versions: [
					version({ maxTradesPerDay: 1 }, "UTC", new Date("2026-03-02T12:00Z")),
				],
			},
			"2026-03-02T10:00:00Z",
		);
		expect(result.version).toBeNull();
	});

	it("uses the version in effect at entry when the rules change in the day", () => {
		const versions = [
			version({ maxTradesPerDay: 1 }, "UTC", new Date("2026-03-02T09:00Z"), 1),
			version({ maxTradesPerDay: 5 }, "UTC", new Date("2026-03-02T12:00Z"), 2),
		];
		const trades = [open("2026-03-02T08:00:00Z")];

		const before = check({ versions, trades }, "2026-03-02T10:00:00Z");
		const after = check({ versions, trades }, "2026-03-02T13:00:00Z");

		expect(before.version).toBe(1);
		expect(outcomeOf(before, RiskRuleKind.DailyTradeCount)?.outcome).toBe(
			RuleOutcome.Violated,
		);
		expect(after.version).toBe(2);
		expect(outcomeOf(after, RiskRuleKind.DailyTradeCount)?.outcome).toBe(
			RuleOutcome.Pass,
		);
	});

	it("leaves a rule that the version does not set as NotSet", () => {
		const result = check(
			{ versions: [version({ maxTradesPerDay: 3 })] },
			"2026-03-02T10:00:00Z",
		);
		expect(outcomeOf(result, RiskRuleKind.Cooldown)?.outcome).toBe(
			RuleOutcome.NotSet,
		);
	});
});

describe("risk per trade", () => {
	const at = "2026-03-02T10:00:00Z";
	const amount = (limit: string, patch: Partial<TradeCaptureValues> = {}) =>
		outcomeOf(
			check({ versions: [version({ maxTradeRiskAmount: limit })] }, at, patch),
			RiskRuleKind.TradeRiskAmount,
		);
	const percent = (limit: string, patch: Partial<TradeCaptureValues> = {}) =>
		outcomeOf(
			check({ versions: [version({ maxTradeRiskPercent: limit })] }, at, patch),
			RiskRuleKind.TradeRiskPercent,
		);

	it("passes under and at the limit, and is violated over it", () => {
		expect(amount("1500")).toMatchObject({
			outcome: RuleOutcome.Pass,
			limit: 1500,
			actual: 1000,
		});
		expect(amount("1000")?.outcome).toBe(RuleOutcome.Pass);
		expect(amount("999")?.outcome).toBe(RuleOutcome.Violated);
		expect(percent("10")?.outcome).toBe(RuleOutcome.Pass);
		expect(percent("9.5")).toMatchObject({
			outcome: RuleOutcome.Violated,
			actual: 10,
		});
	});

	it("is Unknown, not Pass, with no stop", () => {
		expect(amount("1000000", { initialStopPrice: "" })).toMatchObject({
			outcome: RuleOutcome.Unknown,
			reason: RiskUnavailableReason.MissingStop,
		});
		expect(percent("100", { initialStopPrice: "" })?.outcome).toBe(
			RuleOutcome.Unknown,
		);
	});

	it("is Unknown with no entry FX rate", () => {
		expect(
			amount("1000000", {
				symbol: "EURGBP",
				entryPrice: "0.85",
				initialStopPrice: "0.84",
			}),
		).toMatchObject({
			outcome: RuleOutcome.Unknown,
			reason: RiskUnavailableReason.MissingFx,
		});
	});

	it("is Unknown for a risk % with no balance", () => {
		expect(percent("100", { balanceAccount: "" })).toMatchObject({
			outcome: RuleOutcome.Unknown,
			reason: "No balance recorded for risk %",
		});
	});

	it("is Unknown when the plan uses another currency", () => {
		const context = buildRuleContext(
			{
				versions: [version({ maxTradeRiskAmount: "1000000" })],
				currency: "THB",
				trades: [],
				cashFlows: [],
			},
			new Date(at),
		);
		const result = evaluateEntry(context, ruleEntryOf(capture(at), "USD"));
		expect(outcomeOf(result, RiskRuleKind.TradeRiskAmount)).toMatchObject({
			outcome: RuleOutcome.Unknown,
			reason: RiskUnavailableReason.CurrencyMismatch,
		});
	});

	it("is Unknown when the stop is on the wrong side", () => {
		expect(amount("1000000", { initialStopPrice: "1.2" })).toMatchObject({
			outcome: RuleOutcome.Unknown,
			reason: RiskUnavailableReason.InvalidInput,
		});
	});
});

describe("daily loss", () => {
	const at = "2026-03-02T15:00:00Z";
	const loss = (
		trades: RuleHistory["trades"],
		rule: RiskRules["dailyLoss"] = { unit: DailyLossUnit.Amount, value: "500" },
		cashFlows: RuleHistory["cashFlows"] = [],
		patch: Partial<TradeCaptureValues> = {},
	) =>
		outcomeOf(
			check(
				{ versions: [version({ dailyLoss: rule })], trades, cashFlows },
				at,
				patch,
			),
			RiskRuleKind.DailyLoss,
		);

	it("passes under the limit, and is violated at and over it", () => {
		expect(loss([closed("2026-03-02T09:00:00Z", -499)])).toMatchObject({
			outcome: RuleOutcome.Pass,
			limit: 500,
			actual: 499,
		});
		expect(loss([closed("2026-03-02T09:00:00Z", -500)])?.outcome).toBe(
			RuleOutcome.Violated,
		);
		expect(
			loss([
				closed("2026-03-02T09:00:00Z", -400),
				closed("2026-03-02T10:00:00Z", -200),
				closed("2026-03-02T11:00:00Z", 50),
			]),
		).toMatchObject({ outcome: RuleOutcome.Violated, actual: 550 });
	});

	it("counts only the losses realized before the entry", () => {
		expect(loss([closed("2026-03-02T16:00:00Z", -900)])?.outcome).toBe(
			RuleOutcome.Pass,
		);
	});

	it("adds the P&L of a trade logged closed on the same day", () => {
		const result = loss([closed("2026-03-02T09:00:00Z", -400)], undefined, [], {
			exitPrice: "1.099",
			exitDate: "2026-03-02T16:00:00Z",
		});
		expect(result).toMatchObject({
			outcome: RuleOutcome.Violated,
			actual: 500,
		});
	});

	it("is Unknown when a closed trade of the day has no P&L", () => {
		expect(
			loss([
				closed("2026-03-02T09:00:00Z", -100),
				closed("2026-03-02T10:00:00Z", null),
			]),
		).toMatchObject({
			outcome: RuleOutcome.Unknown,
			reason: "1 closed trade today has no P&L",
		});
		expect(
			loss([
				closed("2026-03-02T09:00:00Z", -600),
				closed("2026-03-02T10:00:00Z", null),
			])?.outcome,
		).toBe(RuleOutcome.Violated);
	});

	describe("as a % of the day-start balance", () => {
		const percent = { unit: DailyLossUnit.BalancePercent, value: "2" };

		it("uses deposits and the P&L realized before the day start", () => {
			const flows = [deposit("2026-02-01T00:00:00Z", 10000)];
			const history = [closed("2026-02-10T10:00:00Z", 500)];

			expect(
				loss(
					[...history, closed("2026-03-02T09:00:00Z", -209)],
					percent,
					flows,
				),
			).toMatchObject({ outcome: RuleOutcome.Pass, limit: 210, actual: 209 });
			expect(
				loss([...history, closed("2026-03-02T09:00:00Z", -210)], percent, flows)
					?.outcome,
			).toBe(RuleOutcome.Violated);
		});

		it("does not count a deposit made in the day", () => {
			expect(
				loss([closed("2026-03-02T09:00:00Z", -100)], percent, [
					deposit("2026-02-01T00:00:00Z", 1000),
					deposit("2026-03-02T08:00:00Z", 100000),
				]),
			).toMatchObject({ outcome: RuleOutcome.Violated, limit: 20 });
		});

		it("is Unknown with no positive balance", () => {
			expect(loss([], percent)).toMatchObject({
				outcome: RuleOutcome.Unknown,
				reason: "Day-start balance unavailable",
			});
		});

		it("is Unknown when an earlier closed trade has no P&L", () => {
			expect(
				loss([closed("2026-02-10T10:00:00Z", null)], percent, [
					deposit("2026-02-01T00:00:00Z", 10000),
				]),
			).toMatchObject({
				outcome: RuleOutcome.Unknown,
				reason: "Day-start balance unavailable",
			});
		});
	});
});

describe("trades per day", () => {
	const at = "2026-03-02T15:00:00Z";
	const count = (entered: number) =>
		outcomeOf(
			check(
				{
					versions: [version({ maxTradesPerDay: 3 })],
					trades: Array.from({ length: entered }, (_, index) =>
						open(`2026-03-02T0${index + 1}:00:00Z`),
					),
				},
				at,
			),
			RiskRuleKind.DailyTradeCount,
		);

	it("counts this trade with the trades entered that day", () => {
		expect(count(1)).toMatchObject({
			outcome: RuleOutcome.Pass,
			limit: 3,
			actual: 2,
		});
		expect(count(2)?.outcome).toBe(RuleOutcome.Pass);
		expect(count(3)).toMatchObject({
			outcome: RuleOutcome.Violated,
			actual: 4,
		});
	});
});

describe("day boundaries", () => {
	it("finds midnight in New York on DST change days", () => {
		expect(zonedDayStart("2026-03-08", "America/New_York").toISOString()).toBe(
			"2026-03-08T05:00:00.000Z",
		);
		expect(zonedDayStart("2026-03-09", "America/New_York").toISOString()).toBe(
			"2026-03-09T04:00:00.000Z",
		);
		expect(zonedDayStart("2026-11-01", "America/New_York").toISOString()).toBe(
			"2026-11-01T04:00:00.000Z",
		);
		expect(zonedDayStart("2026-10-10", "Asia/Bangkok").toISOString()).toBe(
			"2026-10-09T17:00:00.000Z",
		);
	});

	it("ends the day at midnight in New York on the DST start day", () => {
		const versions = [version({ maxTradesPerDay: 1 }, "America/New_York")];
		const at = "2026-03-08T15:00:00Z";

		const lastMinute = check(
			{ versions, trades: [open("2026-03-08T04:59:00Z")] },
			at,
		);
		const firstMinute = check(
			{ versions, trades: [open("2026-03-08T05:00:00Z")] },
			at,
		);

		expect(lastMinute.dayKey).toBe("2026-03-08");
		expect(outcomeOf(lastMinute, RiskRuleKind.DailyTradeCount)?.outcome).toBe(
			RuleOutcome.Pass,
		);
		expect(outcomeOf(firstMinute, RiskRuleKind.DailyTradeCount)?.outcome).toBe(
			RuleOutcome.Violated,
		);
	});

	it("starts the day-start balance at New York midnight after the DST end", () => {
		const versions = [
			version(
				{ dailyLoss: { unit: DailyLossUnit.BalancePercent, value: "10" } },
				"America/New_York",
			),
		];
		const at = "2026-11-01T15:00:00Z";
		const limitWith = (depositISO: string) =>
			outcomeOf(
				check(
					{
						versions,
						cashFlows: [
							deposit("2026-10-01T00:00:00Z", 1000),
							deposit(depositISO, 1000),
						],
					},
					at,
				),
				RiskRuleKind.DailyLoss,
			)?.limit;

		expect(limitWith("2026-11-01T03:59:00Z")).toBe(200);
		expect(limitWith("2026-11-01T04:00:00Z")).toBe(100);
	});

	it("ends the day at midnight in Bangkok", () => {
		const versions = [
			version(
				{ dailyLoss: { unit: DailyLossUnit.Amount, value: "100" } },
				"Asia/Bangkok",
			),
		];
		const at = "2026-10-09T18:00:00Z";
		const lossWith = (exitISO: string) =>
			outcomeOf(
				check({ versions, trades: [closed(exitISO, -100)] }, at),
				RiskRuleKind.DailyLoss,
			)?.outcome;

		expect(check({ versions }, at).dayKey).toBe("2026-10-10");
		expect(lossWith("2026-10-09T16:59:00Z")).toBe(RuleOutcome.Pass);
		expect(lossWith("2026-10-09T17:00:00Z")).toBe(RuleOutcome.Violated);
	});
});

describe("cooldown", () => {
	const cooldown = (
		afterLosses: number,
		trades: RuleHistory["trades"],
		at = "2026-03-02T12:10:00Z",
	) =>
		outcomeOf(
			check(
				{
					versions: [version({ cooldown: { afterLosses, minutes: 30 } })],
					trades,
				},
				at,
			),
			RiskRuleKind.Cooldown,
		);

	it("is violated inside the wait after one loss", () => {
		const trades = [closed("2026-03-02T12:00:00Z", -50)];
		expect(cooldown(1, trades)).toMatchObject({
			outcome: RuleOutcome.Violated,
			until: "2026-03-02T12:30:00.000Z",
		});
		expect(cooldown(1, trades, "2026-03-02T12:30:00Z")?.outcome).toBe(
			RuleOutcome.Pass,
		);
	});

	it("needs three losses in a row when the rule says three", () => {
		const two = [
			closed("2026-03-02T10:00:00Z", 20),
			closed("2026-03-02T11:00:00Z", -10),
			closed("2026-03-02T12:00:00Z", -10),
		];
		const three = [closed("2026-03-02T09:00:00Z", -10), ...two.slice(1)];
		expect(cooldown(3, two)?.outcome).toBe(RuleOutcome.Pass);
		expect(cooldown(3, three)?.outcome).toBe(RuleOutcome.Violated);
	});

	it("is Unknown when a losing trade in the streak has no exit time", () => {
		expect(
			cooldown(1, [closed(null, -50, "2026-03-02T12:00:00Z")]),
		).toMatchObject({
			outcome: RuleOutcome.Unknown,
			reason: "A recent losing trade has no exit time",
		});
	});

	it("is Unknown when a trade in the streak has no P&L", () => {
		expect(cooldown(1, [closed("2026-03-02T12:00:00Z", null)])).toMatchObject({
			outcome: RuleOutcome.Unknown,
			reason: "A recent closed trade has no P&L",
		});
	});
});
