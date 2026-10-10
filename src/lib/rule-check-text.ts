import { formatMoney } from "./currency";
import {
	RiskRuleKind,
	RuleOutcome,
	type RuleResult,
} from "./risk-rule-evaluation";

const LABEL: Record<RiskRuleKind, string> = {
	[RiskRuleKind.TradeRiskAmount]: "Risk per trade",
	[RiskRuleKind.TradeRiskPercent]: "Risk % per trade",
	[RiskRuleKind.DailyLoss]: "Loss today",
	[RiskRuleKind.DailyTradeCount]: "Trades today",
	[RiskRuleKind.Cooldown]: "Cooldown",
};

export const RULE_STATUS_TEXT: Record<RuleOutcome, string> = {
	[RuleOutcome.Pass]: "Pass",
	[RuleOutcome.Violated]: "Violated",
	[RuleOutcome.Unknown]: "Unknown",
	[RuleOutcome.NotSet]: "Not set",
};

export const lowerFirst = (text: string) =>
	text.charAt(0).toLowerCase() + text.slice(1);

const formatTime = (iso: string, timeZone: string) =>
	new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
	timeZone: "UTC",
	weekday: "short",
	day: "numeric",
	month: "short",
});

export const formatDay = (dayKey: string) =>
	DAY_FORMAT.format(new Date(`${dayKey}T00:00:00Z`));

function cooldownDetail(result: RuleResult, timeZone: string) {
	const losses = `${result.actual} ${result.actual === 1 ? "loss" : "losses"}`;
	const wait = result.until
		? `wait until ${formatTime(result.until, timeZone)}`
		: "no wait";
	return `after ${losses}: ${wait}`;
}

function detailOf(result: RuleResult, currency: string, timeZone: string) {
	if (result.reason) return lowerFirst(result.reason);
	const { actual, limit } = result;
	switch (result.kind) {
		case RiskRuleKind.TradeRiskAmount:
		case RiskRuleKind.DailyLoss:
			return `${formatMoney(actual ?? 0, currency)} of ${formatMoney(limit ?? 0, currency)}`;
		case RiskRuleKind.TradeRiskPercent:
			return `${(actual ?? 0).toFixed(2)}% of ${limit}%`;
		case RiskRuleKind.DailyTradeCount:
			return `${actual} of ${limit}`;
		case RiskRuleKind.Cooldown:
			return cooldownDetail(result, timeZone);
	}
}

export const ruleLineOf = (
	result: RuleResult,
	currency: string,
	timeZone: string,
) => `${LABEL[result.kind]}: ${detailOf(result, currency, timeZone)}`;

export const setOutcomes = (outcomes: RuleResult[]) =>
	outcomes.filter((result) => result.outcome !== RuleOutcome.NotSet);

export const ruleOutcomeText = (
	outcomes: RuleResult[],
	currency: string,
	timeZone: string,
) =>
	setOutcomes(outcomes)
		.map(
			(result) =>
				`${ruleLineOf(result, currency, timeZone)} · ${RULE_STATUS_TEXT[result.outcome]}`,
		)
		.join("\n");
