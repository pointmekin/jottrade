import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { lockPortfolio, requireOwnedPortfolio } from "@/db/portfolios";
import { loadPosition } from "@/db/positions";
import { tradeExecutions, trades, tradeTags } from "@/db/schema";
import { positionRow } from "@/db/trade-filter";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import {
	PositionError,
	positionErrorMessage,
	positionTotals,
	replayPosition,
} from "@/lib/position";
import {
	groupedNotes,
	groupingError,
	legFills,
	suggestGroups,
} from "@/lib/position-grouping";
import { TradeStatus } from "@/lib/trade";

const legColumns = {
	id: trades.id,
	portfolioId: trades.portfolioId,
	symbol: trades.symbol,
	side: trades.side,
	status: trades.status,
	entryDate: trades.entryDate,
	entryPrice: trades.entryPrice,
	quantity: trades.quantity,
	exitDate: trades.exitDate,
	exitPrice: trades.exitPrice,
	fees: trades.fees,
	netPnl: trades.netPnl,
	brokerTicket: trades.brokerTicket,
	importHash: trades.importHash,
	groupedIntoId: trades.groupedIntoId,
};

export async function loadGroupSuggestions(
	userId: string,
	portfolioId: number,
) {
	await requireOwnedPortfolio(userId, portfolioId);
	const rows = await db
		.select(legColumns)
		.from(trades)
		.where(
			and(
				positionRow,
				eq(trades.userId, userId),
				eq(trades.portfolioId, portfolioId),
				eq(trades.status, TradeStatus.Closed),
				isNotNull(trades.importHash),
			),
		)
		.orderBy(asc(trades.exitDate), asc(trades.id));
	return suggestGroups(rows).map((suggestion) => ({
		...suggestion,
		legs: rows.filter((row) => suggestion.tradeIds.includes(row.id)),
	}));
}

export function loadGroupLegs(userId: string, tradeIds: number[]) {
	if (!tradeIds.length) return Promise.resolve([]);
	return db
		.select({ id: trades.id, brokerTicket: trades.brokerTicket })
		.from(trades)
		.where(and(inArray(trades.id, tradeIds), eq(trades.userId, userId)))
		.orderBy(asc(trades.id));
}

const sameOrNull = <T>(values: T[]) =>
	new Set(values.map((value) => JSON.stringify(value))).size === 1
		? values[0]
		: null;

/**
 * Creates one position from broker rows. The rows stay unchanged as its legs, and the
 * position net P&L is the sum of their broker net P&L.
 */
export async function groupBrokerRows(
	userId: string,
	portfolioId: number,
	tradeIds: number[],
) {
	const portfolio = await requireOwnedPortfolio(userId, portfolioId);
	const legs = await db
		.select({
			...legColumns,
			editRevision: trades.editRevision,
			brokerSource: trades.brokerSource,
			notes: trades.notes,
			setupId: trades.setupId,
			playbookCheck: trades.playbookCheck,
		})
		.from(trades)
		.where(
			and(
				inArray(trades.id, tradeIds),
				eq(trades.userId, userId),
				eq(trades.portfolioId, portfolioId),
			),
		)
		.orderBy(asc(trades.entryDate), asc(trades.id));
	if (legs.length !== new Set(tradeIds).size)
		throw new Error("Trade not found");
	const error = groupingError(legs);
	if (error) throw new Error(error);
	const [first] = legs;
	const replay = replayPosition(first.side, legFills(legs), {
		symbol: first.symbol,
		accountCurrency: portfolio.currency ?? DEFAULT_CURRENCY,
	});
	if (!replay.ok)
		throw new Error(
			replay.error === PositionError.Reopen
				? "The rows do not overlap in time, so they are not one position."
				: positionErrorMessage(replay),
		);
	const { rows } = await db.execute<{ id: number }>(
		sql`SELECT nextval(pg_get_serial_sequence('trades','id'))::int AS id`,
	);
	const positionId = rows[0].id;
	const legsAtRevision = or(
		...legs.map((leg) =>
			and(eq(trades.id, leg.id), eq(trades.editRevision, leg.editRevision)),
		),
	);
	const legIds = legs.map((leg) => leg.id);
	await db.batch([
		lockPortfolio(userId, portfolioId),
		// Division by zero rolls back the batch when a leg changed or was grouped.
		db.execute(
			sql`SELECT 1/(count(*) = ${legs.length})::int FROM (SELECT id FROM trades WHERE ${legsAtRevision} AND user_id = ${userId} AND portfolio_id = ${portfolioId} AND grouped_into_id IS NULL FOR UPDATE) AS locked`,
		),
		db.insert(trades).values({
			id: positionId,
			userId,
			portfolioId,
			symbol: first.symbol,
			side: first.side,
			...positionTotals(first.side, replay.steps),
			brokerSource: first.brokerSource,
			executionCount: replay.steps.length,
			notes: groupedNotes(legs),
			setupId: sameOrNull(legs.map((leg) => leg.setupId)),
			playbookCheck: sameOrNull(legs.map((leg) => leg.playbookCheck)),
		}),
		db.insert(tradeExecutions).values(
			replay.steps.map((step, index) => {
				const fill = step.fill as ReturnType<typeof legFills>[number];
				return {
					userId,
					portfolioId,
					tradeId: positionId,
					kind: fill.kind,
					executedAt: fill.executedAt,
					price: fill.price,
					quantity: fill.quantity,
					fees: fill.fees || "0",
					realizedPnl: fill.brokerRealizedPnl ?? null,
					sourceTradeId: fill.sourceTradeId,
					sequence: index + 1,
				};
			}),
		),
		db
			.update(trades)
			.set({ groupedIntoId: positionId })
			.where(and(inArray(trades.id, legIds), eq(trades.userId, userId))),
		db.execute(
			sql`INSERT INTO trade_tags (trade_id, tag_id) SELECT DISTINCT ${positionId}::int, tag_id FROM trade_tags WHERE ${inArray(tradeTags.tradeId, legIds)}`,
		),
	]);
	return positionId;
}

/** Deletes a grouped position and its fills. Its broker rows show again. */
export async function ungroupBrokerRows(userId: string, tradeId: number) {
	const { trade, fills } = await loadPosition(userId, tradeId);
	if (!fills.some((fill) => fill.sourceTradeId))
		throw new Error("This trade is not a grouped position.");
	const isNotInReview = sql`NOT EXISTS (SELECT 1 FROM review_source_trades WHERE trade_id = ${tradeId})`;
	const results = await db.batch([
		lockPortfolio(userId, trade.portfolioId),
		db
			.update(trades)
			.set({ groupedIntoId: null })
			.where(
				and(
					eq(trades.groupedIntoId, tradeId),
					eq(trades.userId, userId),
					isNotInReview,
				),
			),
		db
			.delete(trades)
			.where(
				and(eq(trades.id, tradeId), eq(trades.userId, userId), isNotInReview),
			)
			.returning({ id: trades.id }),
	]);
	if (!(results.at(-1) as { id: number }[]).length)
		throw new Error("This position is in a saved review.");
}
