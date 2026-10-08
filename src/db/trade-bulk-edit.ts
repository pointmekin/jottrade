import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { strategies, tags, trades } from "@/db/schema";
import { currentExecutionFingerprint } from "@/lib/review-execution-fingerprint";
import {
	type BulkEditInput,
	type BulkEditResult,
	BulkTradeAction,
	type BulkTradeChange,
} from "@/lib/trade-tag";

export const BULK_EDIT_STALE_MESSAGE =
	"Some selected trades changed or were removed while you worked. Nothing was changed. Reload and try again.";

const idSet = (ids: number[]) =>
	sql`(SELECT value::int FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`;

type Scope = { userId: string; portfolioId: number; tradeIds: number[] };

async function requireOwnedTrades({ userId, portfolioId, tradeIds }: Scope) {
	const rows = await db
		.select()
		.from(trades)
		.where(
			and(
				eq(trades.userId, userId),
				eq(trades.portfolioId, portfolioId),
				inArray(trades.id, tradeIds),
			),
		);
	const missing = tradeIds.length - rows.length;
	if (missing > 0)
		throw new Error(
			`${missing} of ${tradeIds.length} selected trades were deleted or are not in this account. Nothing was changed. Clear the selection and select the trades again.`,
		);
	return rows;
}

async function requireOwnedTags(userId: string, tagIds: number[]) {
	const rows = await db
		.select({ id: tags.id })
		.from(tags)
		.where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
	if (rows.length !== tagIds.length)
		throw new Error("A chosen tag no longer exists. Nothing was changed.");
}

async function requireOwnedStrategy(userId: string, setupId: number | null) {
	if (setupId === null) return;
	const [strategy] = await db
		.select({ id: strategies.id })
		.from(strategies)
		.where(and(eq(strategies.userId, userId), eq(strategies.id, setupId)));
	if (!strategy)
		throw new Error("This strategy no longer exists. Nothing was changed.");
}

/**
 * Locks the selected trades and checks, inside the same statement, that the
 * user still owns every one. When a check fails, the statement changes nothing.
 */
function guardedSql(scope: Scope, extraGuard: SQL, change: SQL) {
	const { userId, portfolioId, tradeIds } = scope;
	return sql`WITH owned AS MATERIALIZED (SELECT id, edit_revision FROM trades WHERE user_id=${userId} AND portfolio_id=${portfolioId} AND id IN ${idSet(tradeIds)} ORDER BY id FOR UPDATE),
 allowed AS MATERIALIZED (SELECT (SELECT count(*) FROM owned)=${tradeIds.length} AND ${extraGuard} AS ok),
 ${change}
 SELECT (SELECT ok FROM allowed) AS ok, (SELECT count(*)::int FROM changed) AS changed`;
}

function ownedTagsGuard(userId: string, tagIds: number[]) {
	return sql`(SELECT count(*) FROM tags WHERE user_id=${userId} AND id IN ${idSet(tagIds)})=${tagIds.length}`;
}

const bumpRevision = (source: string) =>
	sql.raw(
		`changed AS (UPDATE trades SET edit_revision=edit_revision+1 WHERE id IN (SELECT DISTINCT trade_id FROM ${source}) RETURNING id)`,
	);

type RowChange = Exclude<
	BulkTradeChange,
	{ action: typeof BulkTradeAction.MarkReviewed }
>;

function changeSql(scope: Scope, change: RowChange) {
	const { userId } = scope;
	switch (change.action) {
		case BulkTradeAction.AddTags:
			return guardedSql(
				scope,
				ownedTagsGuard(userId, change.tagIds),
				sql`linked AS (INSERT INTO trade_tags(trade_id, tag_id) SELECT o.id, t.id FROM owned o CROSS JOIN tags t WHERE t.user_id=${userId} AND t.id IN ${idSet(change.tagIds)} AND (SELECT ok FROM allowed) ON CONFLICT DO NOTHING RETURNING trade_id),
 ${bumpRevision("linked")}`,
			);
		case BulkTradeAction.RemoveTags:
			return guardedSql(
				scope,
				ownedTagsGuard(userId, change.tagIds),
				sql`unlinked AS (DELETE FROM trade_tags WHERE trade_id IN (SELECT id FROM owned) AND tag_id IN ${idSet(change.tagIds)} AND (SELECT ok FROM allowed) RETURNING trade_id),
 ${bumpRevision("unlinked")}`,
			);
		case BulkTradeAction.SetStrategy:
			return guardedSql(
				scope,
				change.setupId === null
					? sql`true`
					: sql`EXISTS(SELECT 1 FROM strategies WHERE id=${change.setupId} AND user_id=${userId})`,
				sql`changed AS (UPDATE trades SET setup_id=${change.setupId}, edit_revision=edit_revision+1 WHERE id IN (SELECT id FROM owned) AND (SELECT ok FROM allowed) AND setup_id IS DISTINCT FROM ${change.setupId}::int RETURNING id)`,
			);
		case BulkTradeAction.SetConfidence:
			return guardedSql(
				scope,
				sql`true`,
				sql`changed AS (UPDATE trades SET confidence=${change.confidence}, edit_revision=edit_revision+1 WHERE id IN (SELECT id FROM owned) AND (SELECT ok FROM allowed) AND confidence IS DISTINCT FROM ${change.confidence}::text RETURNING id)`,
			);
	}
}

/** The fingerprint is computed from the loaded row, so the update applies only while each row still has that edit revision. */
async function markReviewedSql(
	scope: Scope,
	rows: (typeof trades.$inferSelect)[],
	now: Date,
) {
	const expected = await Promise.all(
		rows.map(async (row) => ({
			id: row.id,
			revision: row.editRevision,
			fingerprint: await currentExecutionFingerprint(row),
		})),
	);
	return guardedSql(
		scope,
		sql`(SELECT count(*) FROM owned o JOIN jsonb_to_recordset(${JSON.stringify(expected)}::jsonb) AS v(id int, revision int, fingerprint text) ON v.id=o.id AND v.revision=o.edit_revision)=${expected.length}`,
		sql`changed AS (UPDATE trades t SET reviewed_at=${now}, reviewed_execution_fingerprint=v.fingerprint, annotation_revision=t.annotation_revision+1, edit_revision=t.edit_revision+1 FROM jsonb_to_recordset(${JSON.stringify(expected)}::jsonb) AS v(id int, revision int, fingerprint text) WHERE t.id=v.id AND t.id IN (SELECT id FROM owned) AND (SELECT ok FROM allowed) AND t.edit_revision=v.revision AND NOT (t.reviewed_at IS NOT NULL AND t.reviewed_execution_fingerprint IS NOT DISTINCT FROM v.fingerprint) RETURNING t.id)`,
	);
}

export async function bulkEditTrades(
	userId: string,
	input: BulkEditInput,
	now = new Date(),
): Promise<BulkEditResult> {
	const scope = { userId, ...input };
	const rows = await requireOwnedTrades(scope);
	const { change } = input;
	if (
		change.action === BulkTradeAction.AddTags ||
		change.action === BulkTradeAction.RemoveTags
	)
		await requireOwnedTags(userId, change.tagIds);
	if (change.action === BulkTradeAction.SetStrategy)
		await requireOwnedStrategy(userId, change.setupId);
	const statement =
		change.action === BulkTradeAction.MarkReviewed
			? await markReviewedSql(scope, rows, now)
			: changeSql(scope, change);
	// The account lock is its own statement, so the guarded statement takes its
	// snapshot after it waits; deleteStrategy takes the same lock first.
	const [, result] = await db.batch([
		db.execute(
			sql`SELECT id FROM portfolios WHERE id=${input.portfolioId} AND user_id=${userId} FOR UPDATE`,
		),
		db.execute<{ ok: boolean; changed: number }>(statement),
	]);
	const [outcome] = result.rows;
	if (!outcome?.ok) throw new Error(BULK_EDIT_STALE_MESSAGE);
	return { selected: input.tradeIds.length, changed: Number(outcome.changed) };
}
