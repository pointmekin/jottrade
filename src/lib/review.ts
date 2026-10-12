import Decimal from "decimal.js";
import { z } from "zod";
import { AccountEntryKind } from "./account-entry";
import { realizedAt } from "./analytics";
import { toDayKey } from "./date";
import { winRateOf } from "./group-summary";
import type {
	ReviewExecutionFacts,
	ReviewSemanticValues,
} from "./review-execution-fingerprint";
import { TradeStatus } from "./trade";

export const ReviewKind = { Daily: "DAILY", Weekly: "WEEKLY" } as const;
export type ReviewKind = (typeof ReviewKind)[keyof typeof ReviewKind];
export const ReviewStatus = { Draft: "DRAFT", Complete: "COMPLETE" } as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];
export const REVIEW_FIELDS = [
	"intent",
	"execution",
	"lesson",
	"nextAction",
	"notes",
	"commitmentReflection",
] as const;
export const reviewFieldsSchema = z.object({
	intent: z.string().max(10000),
	execution: z.string().max(10000),
	lesson: z.string().max(10000),
	nextAction: z.string().max(10000),
	notes: z.string().max(10000),
	commitmentReflection: z.string().max(10000),
});
export type ReviewFields = z.infer<typeof reviewFieldsSchema>;
export const EMPTY_REVIEW_FIELDS: ReviewFields = {
	intent: "",
	execution: "",
	lesson: "",
	nextAction: "",
	notes: "",
	commitmentReflection: "",
};
export type ReviewWindow = {
	periodStart: string;
	periodEndExclusive: string;
	timezoneSnapshot: string;
};
export type ReviewTradeSnapshot = {
	id: number;
	symbol: string;
	side: string;
	status: string | null;
	entryDate: string;
	exitDate: string | null;
	netPnl: string | null;
	notes: string | null;
	executionFacts: ReviewExecutionFacts;
	executionFingerprint: string;
};
export type ReviewCashFlowSnapshot = {
	id: number;
	occurredAt: string;
	amount: string;
	kind: AccountEntryKind;
	note: string | null;
	brokerFacts: ReviewSemanticValues | null;
	executionFingerprint: string;
};
export type ReviewResultSnapshot = {
	tradePnl: string | null;
	adjustmentPnl: string;
	tradingPnl: string | null;
	netDeposits: string;
	closedTradeCount: number;
	missingPnlCount: number;
	winRate: number | null;
	payoffRatio: number | null;
};
export function isReviewDay(day: string, window: ReviewWindow) {
	return day >= window.periodStart && day < window.periodEndExclusive;
}
export function tradeInReview(
	trade: { status: string | null; entryDate: Date; exitDate: Date | null },
	window: ReviewWindow,
) {
	const at =
		trade.status === TradeStatus.Closed ? realizedAt(trade) : trade.entryDate;
	return isReviewDay(toDayKey(at, window.timezoneSnapshot), window);
}
export function summarizeReview(
	trades: ReviewTradeSnapshot[],
	flows: ReviewCashFlowSnapshot[],
): ReviewResultSnapshot {
	const closed = trades.filter((t) => t.status === TradeStatus.Closed);
	const known = closed.flatMap((t) => (t.netPnl === null ? [] : [t.netPnl]));
	const amounts = [...known, ...flows.map((f) => f.amount)];
	const integerDigits = amounts.reduce(
		(digits, value) => Math.max(digits, value.split(".")[0].length),
		1,
	);
	const fractionDigits = amounts.reduce(
		(digits, value) => Math.max(digits, value.split(".")[1]?.length ?? 0),
		0,
	);
	const Exact = Decimal.clone({
		precision:
			integerDigits + fractionDigits + String(amounts.length).length + 4,
	});
	const sum = (values: string[]) =>
		values.reduce((total, value) => total.plus(value), new Exact(0));
	const wins = known.filter((value) => new Exact(value).gt(0));
	const losses = known.filter((value) => new Exact(value).lt(0));
	const missingPnlCount = closed.length - known.length;
	const tradePnl = missingPnlCount ? null : sum(known).toFixed();
	const adjustmentPnl = sum(
		flows
			.filter((f) => f.kind === AccountEntryKind.Adjustment)
			.map((f) => f.amount),
	).toFixed();
	const netDeposits = sum(
		flows
			.filter((f) => f.kind !== AccountEntryKind.Adjustment)
			.map((f) => f.amount),
	).toFixed();
	let payoffRatio: number | null = null;
	if (wins.length && losses.length)
		payoffRatio = sum(wins)
			.div(wins.length)
			.div(sum(losses).div(losses.length).neg())
			.toNumber();
	return {
		tradePnl,
		adjustmentPnl,
		tradingPnl:
			tradePnl === null
				? null
				: new Exact(tradePnl).plus(adjustmentPnl).toFixed(),
		netDeposits,
		closedTradeCount: closed.length,
		missingPnlCount,
		winRate: missingPnlCount ? null : winRateOf(wins.length, losses.length),
		payoffRatio: missingPnlCount ? null : payoffRatio,
	};
}
