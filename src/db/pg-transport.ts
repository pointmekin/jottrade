import type { NeonQueryFunction } from "@neondatabase/serverless";
import { Pool, type PoolClient, type QueryResult, types } from "pg";

type Queryable = Pool | PoolClient;
type QueryOptions = { arrayMode?: boolean; fullResults?: boolean };

// Drizzle maps these itself, so they must reach it as the raw strings that
// the Neon HTTP driver returns: timestamps, dates, intervals and their arrays.
const RAW_TYPE_IDS = new Set([
	1082, 1114, 1184, 1186, 1115, 1182, 1185, 1187, 1231,
]);
const rawTypes = {
	getTypeParser: (id: number, format?: "text" | "binary") =>
		RAW_TYPE_IDS.has(id)
			? (value: string) => value
			: types.getTypeParser(id, format ?? "text"),
};

// Neon queries are lazy: `transaction()` receives them unexecuted and runs
// them on one connection. `execute` keeps that contract for node-postgres.
class PgQuery implements PromiseLike<unknown> {
	constructor(
		private readonly pool: Pool,
		private readonly text: string,
		private readonly values: unknown[],
		private readonly options: QueryOptions,
	) {}

	async execute(client: Queryable): Promise<unknown> {
		const config = { text: this.text, values: this.values, types: rawTypes };
		const result: QueryResult = this.options.arrayMode
			? await client.query({ ...config, rowMode: "array" })
			: await client.query(config);
		return this.options.fullResults ? result : result.rows;
	}

	// biome-ignore lint/suspicious/noThenProperty: Neon's query objects are lazy thenables; drizzle's batch relies on that protocol.
	then<A = unknown, B = never>(
		resolve?: ((value: unknown) => A | PromiseLike<A>) | null,
		reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
	): Promise<A | B> {
		return this.execute(this.pool).then(resolve, reject);
	}
}

/**
 * A node-postgres pool behind the part of Neon's HTTP query function that
 * drizzle-orm/neon-http uses, so a plain PostgreSQL server serves the same
 * `db` (including `db.batch`) as production.
 */
export function createPgTransport(connectionString: string) {
	const pool = new Pool({ connectionString });
	const query = (text: string, values: unknown[] = [], options = {}) =>
		new PgQuery(pool, text, values, options);
	const transaction = async (queries: PgQuery[]) => {
		const client = await pool.connect();
		try {
			await client.query("begin");
			const results: unknown[] = [];
			for (const item of queries) results.push(await item.execute(client));
			await client.query("commit");
			return results;
		} catch (cause) {
			await client.query("rollback");
			throw cause;
		} finally {
			client.release();
		}
	};
	return { query, transaction } as unknown as NeonQueryFunction<false, false>;
}
