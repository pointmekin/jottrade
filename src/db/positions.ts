import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { lockPortfolio, requireOwnedPortfolio } from "@/db/portfolios";
import { tradeExecutions, trades } from "@/db/schema";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import {
	ExecutionKind,
	type PositionFill,
	type PositionInstrument,
	positionErrorMessage,
	positionTotals,
	type Realization,
	replayPosition,
	toRealizations,
} from "@/lib/position";
import { TradeStatus } from "@/lib/trade";
import { savedUnitQuote } from "@/lib/trade-update";

const STALE_MESSAGE = "Trade changed. Reload before saving.";

type StoredTrade = typeof trades.$inferSelect;
export type ExecutionFill = PositionFill & {
	id?: number;
	sourceTradeId?: number | null;
};
export type Position = {
	trade: StoredTrade;
	instrument: PositionInstrument;
	fills: ExecutionFill[];
};

// A trade with no fill rows is one entry and, when closed, one exit, from its own columns.
function implicitFills(trade: StoredTrade): ExecutionFill[] {
	if (!trade.entryPrice || !trade.quantity) return [];
	const fees = trade.fees ?? "0";
	const entry = {
		kind: ExecutionKind.Entry,
		executedAt: trade.entryDate,
		price: trade.entryPrice,
		quantity: trade.quantity,
		fees: trade.exitPrice ? "0" : fees,
	};
	if (!trade.exitPrice) return [entry];
	return [
		entry,
		{
			kind: ExecutionKind.Exit,
			executedAt: trade.exitDate ?? trade.entryDate,
			price: trade.exitPrice,
			quantity: trade.quantity,
			fees,
			exitQuoteToAccountRate: trade.exitQuoteToAccountRate ?? undefined,
		},
	];
}

export async function loadPosition(
	userId: string,
	tradeId: number,
): Promise<Position> {
	const [trade] = await db
		.select()
		.from(trades)
		.where(and(eq(trades.id, tradeId), eq(trades.userId, userId)));
	if (!trade) throw new Error("Trade not found");
	const portfolio = await requireOwnedPortfolio(userId, trade.portfolioId);
	const instrument = {
		symbol: trade.symbol,
		accountCurrency: portfolio.currency ?? DEFAULT_CURRENCY,
		confirmedUnitQuoteCurrency: savedUnitQuote(trade) || undefined,
	};
	if (trade.executionCount === 0)
		return { trade, instrument, fills: implicitFills(trade) };
	const rows = await db
		.select()
		.from(tradeExecutions)
		.where(
			and(
				eq(tradeExecutions.tradeId, tradeId),
				eq(tradeExecutions.userId, userId),
			),
		)
		.orderBy(asc(tradeExecutions.executedAt), asc(tradeExecutions.sequence));
	const fills = rows.map((row) => ({
		id: row.id,
		kind: row.kind,
		executedAt: row.executedAt,
		price: row.price,
		quantity: row.quantity,
		fees: row.fees,
		exitQuoteToAccountRate: row.exitQuoteToAccountRate ?? undefined,
		sourceTradeId: row.sourceTradeId,
	}));
	return { trade, instrument, fills };
}

function assertMaterializable({ trade, instrument, fills }: Position) {
	if (trade.importHash || trade.brokerSource)
		throw new Error(
			"Broker rows cannot get manual fills. Group imported rows instead.",
		);
	if (fills.length === 0)
		throw new Error("Enter the entry price and quantity first.");
	if ((trade.status === TradeStatus.Closed) !== Boolean(trade.exitPrice))
		throw new Error(
			"The trade status and exit price do not match. Edit the trade first.",
		);
	if (!trade.exitPrice) return;
	const replay = replayPosition(trade.side, fills, instrument);
	if (!replay.ok) throw new Error(positionErrorMessage(replay));
	const difference = Math.abs(
		Number(positionTotals(trade.side, replay.steps).netPnl) -
			Number(trade.netPnl),
	);
	if (trade.netPnl === null || difference >= 0.005)
		throw new Error(
			`The recalculated P&L differs from the saved P&L by ${formatMoney(difference, instrument.accountCurrency)}. Edit the trade first.`,
		);
}

/** Reads the position for a fill write. The first write turns the implicit fills into rows. */
export async function loadPositionForWrite(
	userId: string,
	tradeId: number,
	expectedRevision: number,
) {
	const position = await loadPosition(userId, tradeId);
	if (position.trade.editRevision !== expectedRevision)
		throw new Error(STALE_MESSAGE);
	if (position.trade.executionCount === 0) assertMaterializable(position);
	return position;
}

/** Replays the fills, then replaces the fill rows and the trade totals in one transaction. */
export async function writePositionFills(
	userId: string,
	{ trade, instrument }: Position,
	fills: ExecutionFill[],
	expectedRevision: number,
) {
	const replay = replayPosition(trade.side, fills, instrument);
	if (!replay.ok) throw new Error(positionErrorMessage(replay));
	const totals = positionTotals(trade.side, replay.steps);
	const rows = replay.steps.map((step, index) => {
		const fill = step.fill as ExecutionFill;
		return {
			id: fill.id,
			userId,
			portfolioId: trade.portfolioId,
			tradeId: trade.id,
			kind: fill.kind,
			executedAt: fill.executedAt,
			price: fill.price,
			quantity: fill.quantity,
			fees: fill.fees || "0",
			exitQuoteToAccountRate: fill.exitQuoteToAccountRate || null,
			realizedPnl: step.realizedPnl?.toFixed(2) ?? null,
			sourceTradeId: fill.sourceTradeId ?? null,
			sequence: index + 1,
		};
	});
	const isOwnedAtRevision = and(
		eq(trades.id, trade.id),
		eq(trades.userId, userId),
		eq(trades.editRevision, expectedRevision),
	);
	try {
		const results = await db.batch([
			lockPortfolio(userId, trade.portfolioId),
			// Division by zero rolls back the batch when the revision changed.
			db.execute(
				sql`SELECT 1/count(*)::int FROM (SELECT id FROM trades WHERE ${isOwnedAtRevision} FOR UPDATE) AS locked`,
			),
			db
				.delete(tradeExecutions)
				.where(
					and(
						eq(tradeExecutions.tradeId, trade.id),
						eq(tradeExecutions.userId, userId),
					),
				),
			db.insert(tradeExecutions).values(rows),
			db
				.update(trades)
				.set({
					...totals,
					executionCount: rows.length,
					editRevision: sql`${trades.editRevision} + 1`,
				})
				.where(isOwnedAtRevision)
				.returning({ id: trades.id }),
		]);
		if (!(results.at(-1) as { id: number }[]).length)
			throw new Error(STALE_MESSAGE);
	} catch (error) {
		const [current] = await db
			.select({ editRevision: trades.editRevision })
			.from(trades)
			.where(and(eq(trades.id, trade.id), eq(trades.userId, userId)));
		if (current?.editRevision !== expectedRevision)
			throw new Error(STALE_MESSAGE);
		throw error;
	}
}

type CashRow = {
	id: number;
	executionCount: number;
	status: string | null;
	netPnl: number | null;
};

/** Adds the exit fills to each trade with fills. A trade without fills gets no `realizations`. */
export async function withRealizations<T extends CashRow>(
	userId: string,
	rows: T[],
): Promise<(T & { realizations?: Realization[] })[]> {
	const ids = rows.filter((row) => row.executionCount > 0).map((row) => row.id);
	if (ids.length === 0) return rows;
	const exits = await db
		.select({
			tradeId: tradeExecutions.tradeId,
			executedAt: tradeExecutions.executedAt,
			realizedPnl: tradeExecutions.realizedPnl,
		})
		.from(tradeExecutions)
		.where(
			and(
				eq(tradeExecutions.userId, userId),
				eq(tradeExecutions.kind, ExecutionKind.Exit),
				inArray(tradeExecutions.tradeId, ids),
			),
		)
		.orderBy(asc(tradeExecutions.executedAt), asc(tradeExecutions.sequence));
	const byTrade = new Map<number, typeof exits>();
	for (const exit of exits)
		byTrade.set(exit.tradeId, [...(byTrade.get(exit.tradeId) ?? []), exit]);
	return rows.map((row) =>
		row.executionCount > 0
			? {
					...row,
					realizations: toRealizations(
						byTrade.get(row.id) ?? [],
						row.status === TradeStatus.Closed ? row.netPnl : null,
					),
				}
			: row,
	);
}
