import Decimal from "decimal.js";
import { z } from "zod";
import { AccountEntryKind } from "./account-entry";
import { realizedAt } from "./analytics";
import { toDayKey } from "./date";
import { winRateOf } from "./group-summary";
import { ExecutionKind } from "./position";
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
	fills?: ReviewFillSnapshot[];
};
export type ReviewFillSnapshot = {
	kind: ExecutionKind;
	executedAt: string;
	price: string;
	quantity: string;
	fees: string;
	realizedPnl: string | null;
	closesPosition: boolean;
};
type StoredFill = Omit<ReviewFillSnapshot, "executedAt" | "closesPosition"> & {
	executedAt: Date;
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
/** The fills of a position in the window. The last exit of a closed position takes the rounding rest, as in `toRealizations`. */
export function reviewFills(
	trade: { status: string | null; netPnl: string | null },
	fills: StoredFill[],
	window: ReviewWindow,
): ReviewFillSnapshot[] {
	const exits = fills.filter((f) => f.kind === ExecutionKind.Exit);
	const finalExit =
		trade.status === TradeStatus.Closed ? exits.at(-1) : undefined;
	const earlier = exits
		.filter((f) => f !== finalExit)
		.reduce((sum, f) => sum.plus(f.realizedPnl ?? 0), new Decimal(0));
	return fills
		.filter((f) =>
			isReviewDay(toDayKey(f.executedAt, window.timezoneSnapshot), window),
		)
		.map((f) => ({
			kind: f.kind,
			executedAt: f.executedAt.toISOString(),
			price: f.price,
			quantity: f.quantity,
			fees: f.fees,
			realizedPnl:
				f === finalExit && trade.netPnl !== null
					? new Decimal(trade.netPnl).minus(earlier).toFixed(2)
					: f.realizedPnl,
			closesPosition: f === finalExit,
		}));
}
/** A position with fills is in the window when one of its fills is; `fills` are its fills in the window. */
export function tradeInReview(
	trade: { status: string | null; entryDate: Date; exitDate: Date | null },
	window: ReviewWindow,
	fills?: ReviewFillSnapshot[],
) {
	if (fills) return fills.length > 0;
	const at =
		trade.status === TradeStatus.Closed ? realizedAt(trade) : trade.entryDate;
	return isReviewDay(toDayKey(at, window.timezoneSnapshot), window);
}
export function summarizeReview(
	trades: ReviewTradeSnapshot[],
	flows: ReviewCashFlowSnapshot[],
): ReviewResultSnapshot {
	const closed = trades.filter((t) =>
		t.fills
			? t.fills.some((f) => f.closesPosition)
			: t.status === TradeStatus.Closed,
	);
	const known = closed.flatMap((t) => (t.netPnl === null ? [] : [t.netPnl]));
	const cash = trades.flatMap((t) => {
		if (!t.fills)
			return t.status === TradeStatus.Closed && t.netPnl !== null
				? [t.netPnl]
				: [];
		return t.fills.flatMap((f) =>
			f.realizedPnl === null ? [] : [f.realizedPnl],
		);
	});
	const amounts = [...known, ...cash, ...flows.map((f) => f.amount)];
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
	const tradePnl = missingPnlCount ? null : sum(cash).toFixed();
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
