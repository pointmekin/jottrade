import { RiskRuleKind } from "./risk-rule-evaluation";

export const RULE_LABEL: Record<RiskRuleKind, string> = {
	[RiskRuleKind.TradeRiskAmount]: "Risk per trade",
	[RiskRuleKind.TradeRiskPercent]: "Risk % per trade",
	[RiskRuleKind.DailyLoss]: "Daily loss",
	[RiskRuleKind.DailyTradeCount]: "Trades per day",
	[RiskRuleKind.Cooldown]: "Cooldown",
};

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
	timeZone: "UTC",
	weekday: "short",
	day: "numeric",
	month: "short",
});

/** A day key is a civil date, so it formats in UTC to keep the same date. */
export const formatRuleDay = (dayKey: string) =>
	DAY_FORMAT.format(new Date(`${dayKey}T00:00:00Z`));

export const formatRuleTime = (iso: string, timeZone: string) =>
	new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));

export const plural = (count: number, word: string, words = `${word}s`) =>
	`${count} ${count === 1 ? word : words}`;
