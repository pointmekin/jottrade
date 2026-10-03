import { sql } from "drizzle-orm";
export function importScopeLockSql(userId: string, portfolioId: number) {
	return sql`SELECT id FROM portfolios WHERE id=${portfolioId} AND user_id=${userId} ORDER BY id FOR UPDATE`;
}
export function importParentLockSql(
	userId: string,
	portfolioId: number,
	kind: "trades" | "cash_flows",
) {
	return sql`SELECT id FROM ${sql.raw(kind)} WHERE user_id=${userId} AND portfolio_id=${portfolioId} ORDER BY id FOR UPDATE`;
}
