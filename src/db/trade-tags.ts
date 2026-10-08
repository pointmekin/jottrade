import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { tags, trades, tradeTags } from "@/db/schema";
import { TagMatch, type TradeTag } from "@/lib/trade-tag";

const tagColumns = { id: tags.id, name: tags.name, color: tags.color };

export function listTags(userId: string): Promise<TradeTag[]> {
	return db
		.select(tagColumns)
		.from(tags)
		.where(eq(tags.userId, userId))
		.orderBy(asc(sql`lower(${tags.name})`));
}

export async function loadTagsByTrade(userId: string, tradeIds: number[]) {
	const byTrade = new Map<number, TradeTag[]>();
	if (!tradeIds.length) return byTrade;
	const rows = await db
		.select({ tradeId: tradeTags.tradeId, ...tagColumns })
		.from(tradeTags)
		.innerJoin(tags, eq(tags.id, tradeTags.tagId))
		.where(and(eq(tags.userId, userId), inArray(tradeTags.tradeId, tradeIds)))
		.orderBy(asc(sql`lower(${tags.name})`));
	for (const { tradeId, ...tag } of rows)
		byTrade.set(tradeId, [...(byTrade.get(tradeId) ?? []), tag]);
	return byTrade;
}

export async function withTags<Row extends { id: number }>(
	userId: string,
	rows: Row[],
) {
	const byTrade = await loadTagsByTrade(
		userId,
		rows.map((row) => row.id),
	);
	return rows.map((row) => ({ ...row, tags: byTrade.get(row.id) ?? [] }));
}

/** "any" keeps a trade with at least one of the tags; "all" keeps a trade with every tag. */
export function tagCondition(tagIds: number[] | undefined, match?: TagMatch) {
	if (!tagIds?.length) return undefined;
	const ids = [...new Set(tagIds)];
	const matching = sql`SELECT 1 FROM ${tradeTags} WHERE ${tradeTags.tradeId} = ${trades.id} AND ${inArray(tradeTags.tagId, ids)}`;
	if (match === TagMatch.All)
		return sql`(SELECT count(*) FROM (${matching}) matched) = ${ids.length}`;
	return sql`EXISTS (${matching})`;
}
