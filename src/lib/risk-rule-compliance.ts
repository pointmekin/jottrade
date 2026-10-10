import { type DateRange, realizedAt } from "./analytics";
import { roundCents } from "./currency";
import { toDayKey, zonedDayStart } from "./date";
import {
	buildRuleContext,
	cooldown,
	dailyLoss,
	dayStartBalance,
	RiskRuleKind,
	type RuleContext,
	type RuleEntry,
	RuleOutcome,
	type RulePlan,
	type RuleResult,
	type RuleTrade,
	type RuleVersion,
	tradeRiskAmount,
	tradeRiskPercent,
	versionInEffect,
} from "./risk-rule-evaluation";
import { DailyLossUnit, hasRiskRules } from "./risk-rules";
import { TradeStatus } from "./trade";

export const ComplianceUnit = { Day: "day", Trade: "trade" } as const;
export type ComplianceUnit =
	(typeof ComplianceUnit)[keyof typeof ComplianceUnit];

export type ComplianceTrade = RuleTrade & {
	id: number;
	imported: boolean;
	plan: RulePlan;
};

export type ComplianceHistory = {
	versions: RuleVersion[];
	currency: string;
	trades: ComplianceTrade[];
	cashFlows: { occurredAt: Date; amount: number; kind?: string }[];
};

export type RuleTally = {
	kind: RiskRuleKind;
	unit: ComplianceUnit;
	pass: number;
	violated: number;
	unknown: number;
};

export type RuleViolation = {
	kind: RiskRuleKind;
	at: string;
	dayKey: string;
	tradeId: number | null;
	version: number;
	limit: number | null;
	actual: number | null;
	sourceTradeIds: number[];
	imported: boolean;
};

export type RuleCompliance = {
	tallies: RuleTally[];
	violations: RuleViolation[];
	versions: number[];
	timezones: string[];
};

const UNIT: Record<RiskRuleKind, ComplianceUnit> = {
	[RiskRuleKind.TradeRiskAmount]: ComplianceUnit.Trade,
	[RiskRuleKind.TradeRiskPercent]: ComplianceUnit.Trade,
	[RiskRuleKind.DailyLoss]: ComplianceUnit.Day,
	[RiskRuleKind.DailyTradeCount]: ComplianceUnit.Day,
	[RiskRuleKind.Cooldown]: ComplianceUnit.Trade,
};

const inRange = (date: Date, { from, to }: DateRange) =>
	(!from || date >= from) && (!to || date <= to);

const isClosed = (trade: RuleTrade) => trade.status === TradeStatus.Closed;

const emptyContext = (
	history: ComplianceHistory,
	version: RuleVersion,
): RuleContext => ({
	currency: history.currency,
	version,
	dayKey: null,
	realizedPnl: 0,
	missingPnlCount: 0,
	enteredCount: 0,
	dayStartBalance: null,
	recentClosed: [],
});

type SortedTrades = {
	entered: ComplianceTrade[];
	closed: ComplianceTrade[];
};

class Tally {
	private readonly counts = new Map<RiskRuleKind, RuleTally>();
	readonly violations: RuleViolation[] = [];
	readonly versions = new Set<number>();
	readonly timezones = new Set<string>();

	add(
		result: RuleResult,
		version: RuleVersion,
		fields: Omit<RuleViolation, "kind" | "version" | "limit" | "actual">,
	) {
		if (result.outcome === RuleOutcome.NotSet) return;
		this.versions.add(version.version);
		this.timezones.add(version.timezone);
		const tally = this.counts.get(result.kind) ?? {
			kind: result.kind,
			unit: UNIT[result.kind],
			pass: 0,
			violated: 0,
			unknown: 0,
		};
		if (result.outcome === RuleOutcome.Pass) tally.pass += 1;
		if (result.outcome === RuleOutcome.Unknown) tally.unknown += 1;
		if (result.outcome === RuleOutcome.Violated) {
			tally.violated += 1;
			this.violations.push({
				kind: result.kind,
				version: version.version,
				limit: result.limit,
				actual: result.actual,
				...fields,
			});
		}
		this.counts.set(result.kind, tally);
	}

	result(): RuleCompliance {
		return {
			tallies: Object.values(RiskRuleKind).flatMap((kind) => {
				const tally = this.counts.get(kind);
				return tally ? [tally] : [];
			}),
			violations: [...this.violations].sort(
				(a, b) =>
					b.at.localeCompare(a.at) || (b.tradeId ?? 0) - (a.tradeId ?? 0),
			),
			versions: [...this.versions].sort((a, b) => a - b),
			timezones: [...this.timezones].sort(),
		};
	}
}

function checkTrades(
	history: ComplianceHistory,
	range: DateRange,
	tally: Tally,
	{ entered, closed }: SortedTrades,
) {
	let closedBefore = 0;
	for (const trade of entered) {
		while (
			closedBefore < closed.length &&
			realizedAt(closed[closedBefore]) < trade.entryDate
		)
			closedBefore += 1;
		const version = versionInEffect(history.versions, trade.entryDate);
		if (!version || !inRange(trade.entryDate, range)) continue;
		const { rules } = version;
		const streak = rules.cooldown?.afterLosses ?? 0;
		const context = {
			...emptyContext(history, version),
			recentClosed: closed
				.slice(Math.max(0, closedBefore - streak), closedBefore)
				.reverse()
				.map((item) => ({
					exitDate: item.exitDate?.toISOString() ?? null,
					netPnl: item.netPnl,
				})),
		};
		const entry: RuleEntry = {
			entryDate: trade.entryDate,
			plan: trade.plan,
			exit: null,
		};
		const fields = {
			at: trade.entryDate.toISOString(),
			dayKey: toDayKey(trade.entryDate, version.timezone),
			tradeId: trade.id,
			sourceTradeIds: [trade.id],
			imported: trade.imported,
		};
		for (const result of [
			tradeRiskAmount(rules, context, entry),
			tradeRiskPercent(rules, context, entry),
			cooldown(rules, context, entry),
		])
			tally.add(result, version, fields);
	}
}

type DayIndex = {
	keyOf: Map<ComplianceTrade, string>;
	days: Map<string, ComplianceTrade[]>;
};

type DayGroup = {
	version: RuleVersion;
	dayKey: string;
	at: Date;
	trades: ComplianceTrade[];
};

/** The trades must be sorted by event time, so each day lists them in order. */
function indexByDay(
	trades: ComplianceTrade[],
	timeZone: string,
	eventAt: (trade: ComplianceTrade) => Date,
): DayIndex {
	const keyOf = new Map<ComplianceTrade, string>();
	const days = new Map<string, ComplianceTrade[]>();
	for (const trade of trades) {
		const key = toDayKey(eventAt(trade), timeZone);
		keyOf.set(trade, key);
		const day = days.get(key) ?? [];
		day.push(trade);
		days.set(key, day);
	}
	return { keyOf, days };
}

/** One group per version timezone and day; the latest event of the day picks the version. */
function dayGroups(
	history: ComplianceHistory,
	range: DateRange,
	trades: ComplianceTrade[],
	eventAt: (trade: ComplianceTrade) => Date,
	isSet: (version: RuleVersion) => boolean,
) {
	const indexes = new Map<string, DayIndex>();
	const groups = new Map<string, DayGroup>();
	for (const trade of trades) {
		const at = eventAt(trade);
		if (!inRange(at, range)) continue;
		const version = versionInEffect(history.versions, at);
		if (!version || !isSet(version)) continue;
		const { timezone } = version;
		const index =
			indexes.get(timezone) ?? indexByDay(trades, timezone, eventAt);
		indexes.set(timezone, index);
		const dayKey = index.keyOf.get(trade) ?? "";
		groups.set(`${timezone}|${dayKey}`, {
			version,
			dayKey,
			at,
			trades: index.days.get(dayKey) ?? [],
		});
	}
	return [...groups.values()];
}

const entryAt = (trade: ComplianceTrade) => trade.entryDate;

function checkTradeCount(
	history: ComplianceHistory,
	range: DateRange,
	tally: Tally,
	entered: ComplianceTrade[],
) {
	const isSet = (version: RuleVersion) =>
		Boolean(version.rules.maxTradesPerDay);
	for (const group of dayGroups(history, range, entered, entryAt, isSet)) {
		const limit = group.version.rules.maxTradesPerDay ?? 0;
		const over = group.trades.slice(limit);
		tally.add(
			{
				kind: RiskRuleKind.DailyTradeCount,
				outcome: over.length ? RuleOutcome.Violated : RuleOutcome.Pass,
				limit,
				actual: group.trades.length,
				reason: null,
				until: null,
			},
			group.version,
			{
				at: group.at.toISOString(),
				dayKey: group.dayKey,
				tradeId: null,
				sourceTradeIds: over.map((trade) => trade.id),
				imported: over.some((trade) => trade.imported),
			},
		);
	}
}

function checkDailyLoss(
	history: ComplianceHistory,
	range: DateRange,
	tally: Tally,
	closed: ComplianceTrade[],
) {
	const isSet = (version: RuleVersion) => Boolean(version.rules.dailyLoss);
	for (const group of dayGroups(history, range, closed, realizedAt, isSet)) {
		const { version, dayKey, trades } = group;
		const isPercent =
			version.rules.dailyLoss?.unit === DailyLossUnit.BalancePercent;
		const context = {
			...emptyContext(history, version),
			dayKey,
			realizedPnl: roundCents(
				trades.reduce((total, trade) => total + (trade.netPnl ?? 0), 0),
			),
			missingPnlCount: trades.filter((trade) => trade.netPnl === null).length,
			dayStartBalance: isPercent
				? dayStartBalance(history, zonedDayStart(dayKey, version.timezone))
				: null,
		};
		const result = dailyLoss(version.rules, context, {
			entryDate: group.at,
			plan: null,
			exit: null,
		});
		tally.add(result, version, {
			at: group.at.toISOString(),
			dayKey,
			tradeId: null,
			sourceTradeIds: trades.map((trade) => trade.id),
			imported: trades.some((trade) => trade.imported),
		});
	}
}

/** Retrospective: it reads the current trades with the version in effect at each event. */
export function evaluateCompliance(
	history: ComplianceHistory,
	range: DateRange,
): RuleCompliance {
	const tally = new Tally();
	if (history.versions.length === 0) return tally.result();
	const sorted = {
		entered: [...history.trades].sort(
			(a, b) => a.entryDate.getTime() - b.entryDate.getTime(),
		),
		closed: history.trades
			.filter(isClosed)
			.sort((a, b) => realizedAt(a).getTime() - realizedAt(b).getTime()),
	};
	checkTrades(history, range, tally, sorted);
	checkDailyLoss(history, range, tally, sorted.closed);
	checkTradeCount(history, range, tally, sorted.entered);
	return tally.result();
}

export type RuleToday = {
	version: number;
	timezone: string;
	dayKey: string;
	dailyLoss: RuleResult | null;
	trades: { limit: number; entered: number } | null;
	cooldown: RuleResult | null;
	openRisk: { amount: number; count: number; unknownCount: number };
};

function openRisk(history: ComplianceHistory) {
	const open = history.trades.filter((trade) => !isClosed(trade));
	const known = open.filter(
		({ plan }) =>
			plan.initialRiskAmount !== null &&
			plan.initialRiskSnapshot?.accountCurrency ===
				history.currency.toUpperCase(),
	);
	return {
		amount: roundCents(
			known.reduce(
				(total, trade) => total + Number(trade.plan.initialRiskAmount),
				0,
			),
		),
		count: known.length,
		unknownCount: open.length - known.length,
	};
}

export function evaluateToday(
	history: ComplianceHistory,
	now: Date,
): RuleToday | null {
	const context = buildRuleContext(history, now);
	const { version, dayKey } = context;
	if (!version || !dayKey || !hasRiskRules(version.rules)) return null;
	const { rules } = version;
	const entry: RuleEntry = { entryDate: now, plan: null, exit: null };
	return {
		version: version.version,
		timezone: version.timezone,
		dayKey,
		dailyLoss: rules.dailyLoss ? dailyLoss(rules, context, entry) : null,
		trades: rules.maxTradesPerDay
			? { limit: rules.maxTradesPerDay, entered: context.enteredCount }
			: null,
		cooldown: rules.cooldown ? cooldown(rules, context, entry) : null,
		openRisk: openRisk(history),
	};
}
