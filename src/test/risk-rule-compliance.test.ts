import { describe, expect, it } from "vitest";
import { AccountEntryKind } from "@/lib/account-entry";
import {
	type ComplianceHistory,
	type ComplianceTrade,
	ComplianceUnit,
	evaluateCompliance,
	evaluateToday,
} from "@/lib/risk-rule-compliance";
import { RiskRuleKind, RuleOutcome } from "@/lib/risk-rule-evaluation";
import { DailyLossUnit, type RiskRules } from "@/lib/risk-rules";
import { TradeStatus } from "@/lib/trade";
import { RiskUnavailableReason } from "@/lib/trade-risk-schema";

const SINCE = new Date("2026-03-01T00:00:00Z");
const ALL = { from: null, to: null };

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

let nextId = 1;
const risk = (amount: string | null, percent: string | null = null) => ({
	initialRiskAmount: amount,
	initialRiskPercent: percent,
	initialRiskSnapshot: {
		accountCurrency: "USD",
		unavailableReason: amount ? null : RiskUnavailableReason.MissingStop,
	},
});

const trade = (
	entryISO: string,
	patch: Partial<ComplianceTrade> = {},
): ComplianceTrade => ({
	id: nextId++,
	status: TradeStatus.Open,
	entryDate: new Date(entryISO),
	exitDate: null,
	netPnl: null,
	imported: false,
	plan: risk("100"),
	...patch,
});

const closed = (
	exitISO: string,
	netPnl: number | null,
	patch: Partial<ComplianceTrade> = {},
) =>
	trade(exitISO, {
		status: TradeStatus.Closed,
		exitDate: new Date(exitISO),
		netPnl,
		...patch,
	});

const history = (patch: Partial<ComplianceHistory>): ComplianceHistory => ({
	versions: [],
	currency: "USD",
	trades: [],
	cashFlows: [],
	...patch,
});

const tallyOf = (
	result: ReturnType<typeof evaluateCompliance>,
	kind: RiskRuleKind,
) => result.tallies.find((item) => item.kind === kind);

describe("evaluateCompliance", () => {
	it("checks nothing with no version", () => {
		const result = evaluateCompliance(
			history({ trades: [trade("2026-03-02T10:00:00Z")] }),
			ALL,
		);
		expect(result).toEqual({
			tallies: [],
			violations: [],
			versions: [],
			timezones: [],
		});
	});

	it("does not check a trade before the first version (no backfill)", () => {
		const result = evaluateCompliance(
			history({
				versions: [version({ maxTradeRiskAmount: "50" })],
				trades: [trade("2026-02-20T10:00:00Z")],
			}),
			ALL,
		);
		expect(result.tallies).toEqual([]);
	});

	it("marks a day over the trade count and links the trades over the limit", () => {
		const day = ["01", "02", "03", "04"].map((hour) =>
			trade(`2026-03-02T${hour}:00:00Z`),
		);
		const other = trade("2026-03-03T10:00:00Z");
		const result = evaluateCompliance(
			history({
				versions: [version({ maxTradesPerDay: 3 })],
				trades: [...day, other],
			}),
			ALL,
		);

		expect(tallyOf(result, RiskRuleKind.DailyTradeCount)).toEqual({
			kind: RiskRuleKind.DailyTradeCount,
			unit: ComplianceUnit.Day,
			pass: 1,
			violated: 1,
			unknown: 0,
		});
		expect(result.violations).toEqual([
			expect.objectContaining({
				kind: RiskRuleKind.DailyTradeCount,
				dayKey: "2026-03-02",
				tradeId: null,
				version: 1,
				limit: 3,
				actual: 4,
				sourceTradeIds: [day[3].id],
				imported: false,
			}),
		]);
	});

	it("counts the trades entered before the rules on the same day", () => {
		const versions = [
			version({ maxTradesPerDay: 1 }, "UTC", new Date("2026-03-02T12:00Z")),
		];
		const early = trade("2026-03-02T09:00:00Z");
		const late = trade("2026-03-02T13:00:00Z", { imported: true });
		const result = evaluateCompliance(
			history({ versions, trades: [late, early] }),
			ALL,
		);
		expect(result.violations[0]).toMatchObject({
			sourceTradeIds: [late.id],
			imported: true,
		});
	});

	it("ends the loss day at midnight in New York and lists the day's trades", () => {
		const versions = [
			version(
				{ dailyLoss: { unit: DailyLossUnit.Amount, value: "500" } },
				"America/New_York",
			),
		];
		// 03:30Z is 22:30 on 1 Mar in New York; 05:30Z is 00:30 on 2 Mar.
		const lateMonday = closed("2026-03-02T03:30:00Z", -400);
		const tuesday = [
			closed("2026-03-02T05:30:00Z", -300),
			closed("2026-03-02T15:00:00Z", -250),
		];
		const result = evaluateCompliance(
			history({ versions, trades: [lateMonday, ...tuesday] }),
			ALL,
		);

		expect(tallyOf(result, RiskRuleKind.DailyLoss)).toMatchObject({
			pass: 1,
			violated: 1,
			unknown: 0,
		});
		expect(result.violations).toEqual([
			expect.objectContaining({
				kind: RiskRuleKind.DailyLoss,
				dayKey: "2026-03-02",
				limit: 500,
				actual: 550,
				sourceTradeIds: tuesday.map((item) => item.id),
			}),
		]);
		expect(result.timezones).toEqual(["America/New_York"]);
	});

	it("gives Unknown, not Pass, for a day with a closed trade with no P&L", () => {
		const result = evaluateCompliance(
			history({
				versions: [
					version({ dailyLoss: { unit: DailyLossUnit.Amount, value: "500" } }),
				],
				trades: [
					closed("2026-03-02T09:00:00Z", -100),
					closed("2026-03-02T10:00:00Z", null),
				],
			}),
			ALL,
		);
		expect(tallyOf(result, RiskRuleKind.DailyLoss)).toMatchObject({
			pass: 0,
			violated: 0,
			unknown: 1,
		});
	});

	it("uses the day-start balance for a % loss limit, and Unknown without one", () => {
		const rules = {
			dailyLoss: { unit: DailyLossUnit.BalancePercent, value: "2" },
		};
		const day = [closed("2026-03-02T09:00:00Z", -210)];
		const funded = evaluateCompliance(
			history({
				versions: [version(rules)],
				trades: day,
				cashFlows: [
					{
						occurredAt: new Date("2026-02-01T00:00:00Z"),
						amount: 10000,
						kind: AccountEntryKind.Deposit,
					},
				],
			}),
			ALL,
		);
		const unfunded = evaluateCompliance(
			history({ versions: [version(rules)], trades: day }),
			ALL,
		);

		expect(funded.violations[0]).toMatchObject({ limit: 200, actual: 210 });
		expect(tallyOf(unfunded, RiskRuleKind.DailyLoss)).toMatchObject({
			unknown: 1,
			violated: 0,
		});
	});

	it("gives Unknown for a trade with no stop, and Violated over the risk limit", () => {
		const over = trade("2026-03-02T09:00:00Z", { plan: risk("150") });
		const result = evaluateCompliance(
			history({
				versions: [version({ maxTradeRiskAmount: "120" })],
				trades: [
					trade("2026-03-02T08:00:00Z", { plan: risk(null), imported: true }),
					over,
					trade("2026-03-02T10:00:00Z"),
				],
			}),
			ALL,
		);

		expect(tallyOf(result, RiskRuleKind.TradeRiskAmount)).toEqual({
			kind: RiskRuleKind.TradeRiskAmount,
			unit: ComplianceUnit.Trade,
			pass: 1,
			violated: 1,
			unknown: 1,
		});
		expect(result.violations).toEqual([
			expect.objectContaining({
				tradeId: over.id,
				sourceTradeIds: [over.id],
				limit: 120,
				actual: 150,
			}),
		]);
	});

	it("follows a risk correction, because it reads the current trade", () => {
		const versions = [version({ maxTradeRiskAmount: "120" })];
		const before = trade("2026-03-02T09:00:00Z", { plan: risk("150") });
		const after = { ...before, plan: risk("90") };

		expect(
			evaluateCompliance(history({ versions, trades: [before] }), ALL)
				.violations,
		).toHaveLength(1);
		expect(
			evaluateCompliance(history({ versions, trades: [after] }), ALL)
				.violations,
		).toEqual([]);
	});

	it("marks an entry inside the cooldown after a loss", () => {
		const loss = closed("2026-03-02T09:00:00Z", -50);
		const tooSoon = trade("2026-03-02T09:10:00Z");
		const later = trade("2026-03-02T10:00:00Z");
		const result = evaluateCompliance(
			history({
				versions: [version({ cooldown: { afterLosses: 1, minutes: 30 } })],
				trades: [loss, tooSoon, later],
			}),
			ALL,
		);

		expect(result.violations).toEqual([
			expect.objectContaining({
				kind: RiskRuleKind.Cooldown,
				tradeId: tooSoon.id,
				sourceTradeIds: [tooSoon.id],
			}),
		]);
	});

	it("uses the version in effect at each trade and lists the versions used", () => {
		const versions = [
			version({ maxTradeRiskAmount: "120" }, "UTC", SINCE, 1),
			version(
				{ maxTradeRiskAmount: "200" },
				"UTC",
				new Date("2026-03-05T00:00Z"),
				2,
			),
		];
		const result = evaluateCompliance(
			history({
				versions,
				trades: [
					trade("2026-03-02T09:00:00Z", { plan: risk("150") }),
					trade("2026-03-06T09:00:00Z", { plan: risk("150") }),
				],
			}),
			ALL,
		);
		expect(result.violations.map((item) => item.version)).toEqual([1]);
		expect(result.versions).toEqual([1, 2]);
	});

	it("checks only the period and lists the newest violation first", () => {
		const versions = [version({ maxTradeRiskAmount: "120" })];
		const trades = ["2026-03-02", "2026-03-04", "2026-03-06"].map((day) =>
			trade(`${day}T09:00:00Z`, { plan: risk("150") }),
		);
		const result = evaluateCompliance(history({ versions, trades }), {
			from: new Date("2026-03-03T00:00:00Z"),
			to: null,
		});
		expect(result.violations.map((item) => item.tradeId)).toEqual([
			trades[2].id,
			trades[1].id,
		]);
	});
});

describe("evaluateToday", () => {
	const NOW = new Date("2026-03-02T15:00:00Z");
	const rules = {
		dailyLoss: { unit: DailyLossUnit.Amount, value: "500" },
		maxTradesPerDay: 3,
		cooldown: { afterLosses: 1, minutes: 60 },
	} as const;

	it("is null with no version or with cleared rules", () => {
		expect(evaluateToday(history({}), NOW)).toBeNull();
		expect(evaluateToday(history({ versions: [version({})] }), NOW)).toBeNull();
	});

	it("gives the loss, the trades and the cooldown of today", () => {
		const today = evaluateToday(
			history({
				versions: [version(rules)],
				trades: [
					closed("2026-03-01T10:00:00Z", -900),
					closed("2026-03-02T14:30:00Z", -320),
					trade("2026-03-02T14:40:00Z", { plan: risk("80") }),
					trade("2026-03-02T14:50:00Z", { plan: risk(null) }),
				],
			}),
			NOW,
		);

		expect(today).toMatchObject({
			version: 1,
			timezone: "UTC",
			dayKey: "2026-03-02",
			dailyLoss: { outcome: RuleOutcome.Pass, limit: 500, actual: 320 },
			trades: { limit: 3, entered: 3 },
			cooldown: {
				outcome: RuleOutcome.Violated,
				until: "2026-03-02T15:30:00.000Z",
			},
			openRisk: { amount: 80, count: 1, unknownCount: 1 },
		});
	});

	it("gives Unknown for the loss when a closed trade today has no P&L", () => {
		const today = evaluateToday(
			history({
				versions: [version(rules)],
				trades: [closed("2026-03-02T09:00:00Z", null)],
			}),
			NOW,
		);
		expect(today?.dailyLoss).toMatchObject({
			outcome: RuleOutcome.Unknown,
			reason: "1 closed trade today has no P&L",
		});
	});
});
