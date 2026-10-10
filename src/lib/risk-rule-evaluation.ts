import { z } from "zod";
import { type CashFlow, realizedAt, summarizeTrades } from "./analytics";
import { roundCents } from "./currency";
import { toDayKey, zonedDayStart } from "./date";
import { calculateManualPnl } from "./pnl-context";
import type { RiskRules } from "./risk-rules";
import { DailyLossUnit } from "./risk-rules";
import { TradeStatus } from "./trade";
import type { TradeCaptureValues } from "./trade-capture";
import { calculateInitialRisk } from "./trade-risk";
import {
	RiskCaptureSource,
	type RiskPlan,
	RiskUnavailableReason,
} from "./trade-risk-schema";

export const RiskRuleKind = {
	TradeRiskAmount: "trade_risk_amount",
	TradeRiskPercent: "trade_risk_percent",
	DailyLoss: "daily_loss",
	DailyTradeCount: "daily_trade_count",
	Cooldown: "cooldown",
} as const;
export type RiskRuleKind = (typeof RiskRuleKind)[keyof typeof RiskRuleKind];

export const RuleOutcome = {
	Pass: "pass",
	Violated: "violated",
	Unknown: "unknown",
	NotSet: "not_set",
} as const;
export type RuleOutcome = (typeof RuleOutcome)[keyof typeof RuleOutcome];

export type RuleVersion = {
	version: number;
	rules: RiskRules;
	timezone: string;
	effectiveFrom: Date;
};

export type RuleTrade = {
	status: string | null;
	entryDate: Date;
	exitDate: Date | null;
	netPnl: number | null;
};

export type RuleHistory = {
	versions: RuleVersion[];
	currency: string;
	trades: RuleTrade[];
	cashFlows: CashFlow[];
};

/** The facts of one account day that the entry check reads. */
export type RuleContext = {
	currency: string;
	version: Omit<RuleVersion, "effectiveFrom"> | null;
	dayKey: string | null;
	realizedPnl: number;
	missingPnlCount: number;
	enteredCount: number;
	dayStartBalance: number | null;
	recentClosed: { exitDate: string | null; netPnl: number | null }[];
};

export type RuleEntry = {
	entryDate: Date;
	plan: RiskPlan | null;
	exit: { at: Date; netPnl: number | null } | null;
};

const ruleResultSchema = z.object({
	kind: z.enum(RiskRuleKind),
	outcome: z.enum(RuleOutcome),
	limit: z.number().nullable(),
	actual: z.number().nullable(),
	reason: z.string().nullable(),
	until: z.string().nullable(),
});
export type RuleResult = z.infer<typeof ruleResultSchema>;

const ruleCheckShape = {
	version: z.number().int().positive().nullable(),
	timezone: z.string().nullable(),
	dayKey: z.string().nullable(),
	outcomes: z.array(ruleResultSchema),
};
export type RuleCheck = z.infer<z.ZodObject<typeof ruleCheckShape>>;

/** The entry check stored on `trades.rule_check`. It never changes after the save. */
export const ruleCheckSchema = z.object({
	v: z.literal(1),
	...ruleCheckShape,
	evaluatedAt: z.iso.datetime(),
	captureSource: z.enum(RiskCaptureSource),
	acknowledged: z.boolean(),
	note: z.string().nullable(),
	reason: z.string().nullable(),
});
export type StoredRuleCheck = z.infer<typeof ruleCheckSchema>;

export const RULES_UNREADABLE = "Rules could not be read";

export const hasViolation = (check: Pick<RuleCheck, "outcomes">) =>
	check.outcomes.some((item) => item.outcome === RuleOutcome.Violated);

const NO_BALANCE = "Day-start balance unavailable";

const isClosed = (trade: RuleTrade) => trade.status === TradeStatus.Closed;
const before = (date: Date, limit: Date) => date.getTime() < limit.getTime();

function versionInEffect(versions: RuleVersion[], entryDate: Date) {
	return versions
		.filter((item) => !before(entryDate, item.effectiveFrom))
		.sort(
			(a, b) =>
				b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
				b.version - a.version,
		)[0];
}

/** Opening funding, cash flows and realized P&L before the day start, as the dashboard balance. */
function dayStartBalance({ trades, cashFlows }: RuleHistory, dayStart: Date) {
	const carried = trades.filter(
		(trade) => isClosed(trade) && before(realizedAt(trade), dayStart),
	);
	if (carried.some((trade) => trade.netPnl === null)) return null;
	const records = trades.map((trade) => ({
		...trade,
		netPnl: trade.netPnl ?? 0,
	}));
	return summarizeTrades(records, cashFlows, { from: dayStart, to: dayStart })
		.stats.openingBalance;
}

export function buildRuleContext(
	history: RuleHistory,
	entryDate: Date,
): RuleContext {
	const found = versionInEffect(history.versions, entryDate);
	const context: RuleContext = {
		currency: history.currency,
		version: null,
		dayKey: null,
		realizedPnl: 0,
		missingPnlCount: 0,
		enteredCount: 0,
		dayStartBalance: null,
		recentClosed: [],
	};
	if (!found) return context;
	const { version: number, rules, timezone } = found;
	const version = { version: number, rules, timezone };
	const dayKey = toDayKey(entryDate, timezone);
	const closedBefore = history.trades
		.filter((trade) => isClosed(trade) && before(realizedAt(trade), entryDate))
		.sort((a, b) => realizedAt(b).getTime() - realizedAt(a).getTime());
	const realizedToday = closedBefore.filter(
		(trade) => toDayKey(realizedAt(trade), timezone) === dayKey,
	);
	return {
		...context,
		version,
		dayKey,
		realizedPnl: roundCents(
			realizedToday.reduce((total, trade) => total + (trade.netPnl ?? 0), 0),
		),
		missingPnlCount: realizedToday.filter((trade) => trade.netPnl === null)
			.length,
		enteredCount: history.trades.filter(
			(trade) => toDayKey(trade.entryDate, timezone) === dayKey,
		).length,
		dayStartBalance: dayStartBalance(history, zonedDayStart(dayKey, timezone)),
		recentClosed: closedBefore
			.slice(0, rules.cooldown?.afterLosses ?? 0)
			.map((trade) => ({
				exitDate: trade.exitDate?.toISOString() ?? null,
				netPnl: trade.netPnl,
			})),
	};
}

/** Builds the entry from form values with ISO dates, with the same plan and P&L as `createTrade`. */
export function ruleEntryOf(
	values: TradeCaptureValues,
	accountCurrency: string,
): RuleEntry {
	let plan: RiskPlan | null = null;
	try {
		plan = calculateInitialRisk({ ...values, accountCurrency });
	} catch {
		plan = null;
	}
	const entryDate = new Date(values.entryDate);
	if (!values.exitPrice) return { entryDate, plan, exit: null };
	let netPnl: number | null = null;
	try {
		netPnl = Number(
			calculateManualPnl({
				...values,
				exitPrice: values.exitPrice,
				accountCurrency,
			}).netPnl,
		);
	} catch {
		netPnl = null;
	}
	const at = values.exitDate ? new Date(values.exitDate) : entryDate;
	return { entryDate, plan, exit: { at, netPnl } };
}

const result = (
	kind: RiskRuleKind,
	outcome: RuleOutcome,
	fields: Partial<RuleResult> = {},
): RuleResult => ({
	kind,
	outcome,
	limit: null,
	actual: null,
	reason: null,
	until: null,
	...fields,
});

const compare = (
	kind: RiskRuleKind,
	limit: number,
	actual: number,
	isViolated: boolean,
) =>
	result(kind, isViolated ? RuleOutcome.Violated : RuleOutcome.Pass, {
		limit,
		actual,
	});

function riskReason(plan: RiskPlan | null, currency: string) {
	if (!plan) return RiskUnavailableReason.InvalidInput;
	if (plan.initialRiskAmount === null)
		return (
			plan.initialRiskSnapshot?.unavailableReason ??
			RiskUnavailableReason.MissingStop
		);
	if (plan.initialRiskSnapshot?.accountCurrency !== currency.toUpperCase())
		return RiskUnavailableReason.CurrencyMismatch;
	return null;
}

function tradeRiskAmount(
	rules: RiskRules,
	context: RuleContext,
	entry: RuleEntry,
) {
	const kind = RiskRuleKind.TradeRiskAmount;
	if (!rules.maxTradeRiskAmount) return result(kind, RuleOutcome.NotSet);
	const limit = Number(rules.maxTradeRiskAmount);
	const reason = riskReason(entry.plan, context.currency);
	if (reason || !entry.plan)
		return result(kind, RuleOutcome.Unknown, { limit, reason });
	const actual = roundCents(Number(entry.plan.initialRiskAmount));
	return compare(kind, limit, actual, actual > limit);
}

function tradeRiskPercent(
	rules: RiskRules,
	context: RuleContext,
	entry: RuleEntry,
) {
	const kind = RiskRuleKind.TradeRiskPercent;
	if (!rules.maxTradeRiskPercent) return result(kind, RuleOutcome.NotSet);
	const limit = Number(rules.maxTradeRiskPercent);
	const reason =
		riskReason(entry.plan, context.currency) ??
		(entry.plan?.initialRiskPercent ? null : "No balance recorded for risk %");
	if (reason || !entry.plan)
		return result(kind, RuleOutcome.Unknown, { limit, reason });
	const actual = roundCents(Number(entry.plan.initialRiskPercent));
	return compare(kind, limit, actual, actual > limit);
}

function dailyLossLimit(rules: RiskRules, balance: number | null) {
	if (!rules.dailyLoss) return null;
	const value = Number(rules.dailyLoss.value);
	if (rules.dailyLoss.unit === DailyLossUnit.Amount) return value;
	return balance !== null && balance > 0
		? roundCents((balance * value) / 100)
		: null;
}

function dailyLoss(rules: RiskRules, context: RuleContext, entry: RuleEntry) {
	const kind = RiskRuleKind.DailyLoss;
	if (!rules.dailyLoss || !context.version)
		return result(kind, RuleOutcome.NotSet);
	const limit = dailyLossLimit(rules, context.dayStartBalance);
	if (limit === null)
		return result(kind, RuleOutcome.Unknown, { reason: NO_BALANCE });
	let pnl = context.realizedPnl;
	let missing = context.missingPnlCount;
	const exitDay =
		entry.exit && toDayKey(entry.exit.at, context.version.timezone);
	if (entry.exit && exitDay === context.dayKey) {
		if (entry.exit.netPnl === null) missing += 1;
		else pnl += entry.exit.netPnl;
	}
	const actual = roundCents(Math.max(0, -pnl));
	if (actual >= limit || !missing)
		return compare(kind, limit, actual, actual >= limit);
	const reason =
		missing === 1
			? "1 closed trade today has no P&L"
			: `${missing} closed trades today have no P&L`;
	return result(kind, RuleOutcome.Unknown, { limit, actual, reason });
}

function dailyTradeCount(rules: RiskRules, context: RuleContext) {
	const kind = RiskRuleKind.DailyTradeCount;
	if (!rules.maxTradesPerDay) return result(kind, RuleOutcome.NotSet);
	const actual = context.enteredCount + 1;
	return compare(
		kind,
		rules.maxTradesPerDay,
		actual,
		actual > rules.maxTradesPerDay,
	);
}

function cooldown(rules: RiskRules, context: RuleContext, entry: RuleEntry) {
	const kind = RiskRuleKind.Cooldown;
	if (!rules.cooldown) return result(kind, RuleOutcome.NotSet);
	const { afterLosses, minutes } = rules.cooldown;
	const fields = { limit: minutes, actual: afterLosses };
	const streak = context.recentClosed.slice(0, afterLosses);
	if (streak.length < afterLosses)
		return result(kind, RuleOutcome.Pass, fields);
	for (const trade of streak) {
		if (trade.netPnl === null)
			return result(kind, RuleOutcome.Unknown, {
				...fields,
				reason: "A recent closed trade has no P&L",
			});
		if (trade.netPnl >= 0) return result(kind, RuleOutcome.Pass, fields);
	}
	const lastExit = streak[0].exitDate;
	if (streak.some((trade) => trade.exitDate === null) || !lastExit)
		return result(kind, RuleOutcome.Unknown, {
			...fields,
			reason: "A recent losing trade has no exit time",
		});
	const until = new Date(Date.parse(lastExit) + minutes * 60_000);
	if (!before(entry.entryDate, until))
		return result(kind, RuleOutcome.Pass, fields);
	return result(kind, RuleOutcome.Violated, {
		...fields,
		until: until.toISOString(),
	});
}

/** Pure: the preview and the server give the same check for the same inputs. */
export function evaluateEntry(
	context: RuleContext,
	entry: RuleEntry,
): RuleCheck {
	const { version } = context;
	if (!version)
		return {
			version: null,
			timezone: null,
			dayKey: null,
			outcomes: Object.values(RiskRuleKind).map((kind) =>
				result(kind, RuleOutcome.NotSet),
			),
		};
	const { rules } = version;
	return {
		version: version.version,
		timezone: version.timezone,
		dayKey: context.dayKey,
		outcomes: [
			tradeRiskAmount(rules, context, entry),
			tradeRiskPercent(rules, context, entry),
			dailyLoss(rules, context, entry),
			dailyTradeCount(rules, context),
			cooldown(rules, context, entry),
		],
	};
}
