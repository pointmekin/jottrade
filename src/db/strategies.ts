import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { strategies } from "@/db/schema";

export const STRATEGY_UNAVAILABLE_MESSAGE =
	"This strategy no longer exists or is archived. Nothing was changed.";

export async function requireOwnedStrategy(
	userId: string,
	setupId: number | null | undefined,
) {
	if (setupId == null) return;
	const [strategy] = await db
		.select({ id: strategies.id })
		.from(strategies)
		.where(
			and(
				eq(strategies.userId, userId),
				eq(strategies.id, setupId),
				isNull(strategies.archivedAt),
			),
		);
	if (!strategy) throw new Error(STRATEGY_UNAVAILABLE_MESSAGE);
}

export const activeStrategySql = (userId: string, setupId: number) =>
	sql`EXISTS(SELECT 1 FROM strategies WHERE id=${setupId} AND user_id=${userId} AND archived_at IS NULL)`;

/** An INSERT has no WHERE, so this division by zero rolls back its batch when the strategy is unavailable. */
export const assertActiveStrategySql = (userId: string, setupId: number) =>
	sql`SELECT 1/count(*)::int FROM strategies WHERE id=${setupId} AND user_id=${userId} AND archived_at IS NULL`;
