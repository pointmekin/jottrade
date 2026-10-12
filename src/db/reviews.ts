import { and, desc, eq, getTableColumns, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { toDayKey } from "@/lib/date";
import {
	EMPTY_REVIEW_FIELDS,
	isReviewDay,
	ReviewKind,
	ReviewStatus,
	type ReviewWindow,
	summarizeReview,
	tradeInReview,
} from "@/lib/review";
import {
	currentCashFlowFingerprint,
	currentExecutionFingerprint,
	reviewCashFlowFacts,
	reviewExecutionFacts,
} from "@/lib/review-execution-fingerprint";
import { reviewPeriod } from "@/lib/review-period";
import {
	cashFlows,
	portfolios,
	reviewPeriods,
	reviewSourceCashFlows,
	reviewSourceTrades,
	trades,
} from "./schema";

export async function reviewAccount(userId: string, portfolioId: number) {
	const [account] = await db
		.select()
		.from(portfolios)
		.where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)));
	if (!account) throw new Error("Account not found.");
	if (!account.reviewTimezone)
		throw new Error("Choose your review timezone first.");
	return account;
}
export async function loadReviewSources(
	userId: string,
	portfolioId: number,
	window: ReviewWindow,
) {
	const [tradeRows, flowRows] = await Promise.all([
		db
			.select({
				...getTableColumns(trades),
				lockHash: sql<string>`md5(to_jsonb(${trades})::text)`,
			})
			.from(trades)
			.where(
				and(eq(trades.userId, userId), eq(trades.portfolioId, portfolioId)),
			)
			.orderBy(trades.id),
		db
			.select({
				...getTableColumns(cashFlows),
				lockHash: sql<string>`md5(to_jsonb(${cashFlows})::text)`,
			})
			.from(cashFlows)
			.where(
				and(
					eq(cashFlows.userId, userId),
					eq(cashFlows.portfolioId, portfolioId),
				),
			)
			.orderBy(cashFlows.id),
	]);
	const selectedTrades = tradeRows.filter((trade) =>
		tradeInReview(trade, window),
	);
	const selectedFlows = flowRows.filter((flow) =>
		isReviewDay(toDayKey(flow.occurredAt, window.timezoneSnapshot), window),
	);
	const tradeSnapshotsPromise = Promise.all(
		selectedTrades.map(async (trade) => ({
			id: trade.id,
			symbol: trade.symbol,
			side: trade.side,
			status: trade.status,
			entryDate: trade.entryDate.toISOString(),
			exitDate: trade.exitDate?.toISOString() ?? null,
			netPnl: trade.netPnl,
			notes: trade.notes,
			executionFacts: reviewExecutionFacts(trade),
			executionFingerprint: await currentExecutionFingerprint(trade),
		})),
	);
	const flowSnapshotsPromise = Promise.all(
		selectedFlows.map(async (flow) => ({
			id: flow.id,
			occurredAt: flow.occurredAt.toISOString(),
			amount: flow.amount,
			kind: flow.kind,
			note: flow.note,
			brokerFacts: reviewCashFlowFacts(flow),
			executionFingerprint: await currentCashFlowFingerprint(flow),
		})),
	);
	const [tradeSnapshots, flowSnapshots] = await Promise.all([
		tradeSnapshotsPromise,
		flowSnapshotsPromise,
	]);
	return {
		trades: tradeSnapshots,
		flows: flowSnapshots,
		tradeSignatures: selectedTrades.map((t) => [t.id, t.lockHash]),
		flowSignatures: selectedFlows.map((f) => [f.id, f.lockHash]),
		results: summarizeReview(tradeSnapshots, flowSnapshots),
	};
}
export async function readReview(
	userId: string,
	scope: { portfolioId: number; kind: ReviewKind; start: string },
) {
	const [account, [existing]] = await Promise.all([
		reviewAccount(userId, scope.portfolioId),
		db
			.select()
			.from(reviewPeriods)
			.where(
				and(
					eq(reviewPeriods.userId, userId),
					eq(reviewPeriods.portfolioId, scope.portfolioId),
					eq(reviewPeriods.kind, scope.kind),
					eq(reviewPeriods.periodStart, scope.start),
				),
			),
	]);
	const window = existing ?? {
		...reviewPeriod(scope.start, scope.kind, account.reviewWeekStartsOn),
		timezoneSnapshot: account.reviewTimezone,
	};
	const sourcesPromise = loadReviewSources(userId, scope.portfolioId, window);
	const previousPromise = db
		.select()
		.from(reviewPeriods)
		.where(
			and(
				eq(reviewPeriods.userId, userId),
				eq(reviewPeriods.portfolioId, scope.portfolioId),
				eq(reviewPeriods.kind, ReviewKind.Weekly),
				eq(reviewPeriods.status, ReviewStatus.Complete),
				lte(reviewPeriods.periodEndExclusive, window.periodStart),
			),
		)
		.orderBy(desc(reviewPeriods.periodStart))
		.limit(1);
	const linksPromise = existing
		? Promise.all([
				db
					.select()
					.from(reviewSourceTrades)
					.where(eq(reviewSourceTrades.reviewId, existing.id)),
				db
					.select()
					.from(reviewSourceCashFlows)
					.where(eq(reviewSourceCashFlows.reviewId, existing.id)),
			])
		: Promise.resolve([[], []] as const);
	const [sources, [previous], [tradeLinks, flowLinks]] = await Promise.all([
		sourcesPromise,
		previousPromise,
		linksPromise,
	]);
	return {
		period: existing,
		window,
		fields: existing ?? EMPTY_REVIEW_FIELDS,
		revision: existing?.revision ?? 0,
		currency: existing?.currencySnapshot ?? account.currency ?? "USD",
		liveCurrency: account.currency ?? "USD",
		previousCommitment: existing
			? existing.previousCommitmentSnapshot
			: (previous?.nextAction ?? null),
		previousReviewId: existing
			? existing.previousReviewId
			: (previous?.id ?? null),
		sources,
		tradeLinks,
		flowLinks,
		weekStartsOn: existing?.weekStartsOnSnapshot ?? account.reviewWeekStartsOn,
	};
}
