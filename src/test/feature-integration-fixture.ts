import { readdirSync, readFileSync } from "node:fs";
import { Pool, type PoolClient, type QueryResult, types } from "pg";
import type { Mock } from "vitest";

type Request = { execute: (client: Pool | PoolClient) => Promise<QueryResult> };
export const integrationUrl = process.env.INTEGRATION_TEST_DATABASE_URL;

export function integrationPool(transport: { query: Mock; transaction: Mock }) {
	const url = new URL(integrationUrl ?? "");
	if (
		url.hostname !== "127.0.0.1" ||
		url.port !== "49485" ||
		url.username !== "jottrade_fixture" ||
		url.pathname !== "/integration_behavior"
	)
		throw new Error("Only the disposable integration database is allowed.");
	return transportPool(transport, integrationUrl ?? "");
}

/** Routes the mocked Neon transport to a real PostgreSQL pool. Callers must check that the URL is disposable. */
export function transportPool(
	transport: { query: Mock; transaction: Mock },
	connectionString: string,
) {
	const pool = new Pool({ connectionString });
	const rawTypes = {
		getTypeParser: (oid: number) =>
			[1082, 1114, 1184].includes(oid)
				? (value: string) => value
				: types.getTypeParser(oid),
	};
	transport.query.mockImplementation(
		(text: string, values: unknown[], options: { arrayMode?: boolean }) => {
			const execute = (client: Pool | PoolClient): Promise<QueryResult> =>
				options?.arrayMode
					? client.query({ text, values, rowMode: "array", types: rawTypes })
					: client.query({ text, values, types: rawTypes });
			return {
				execute,
				// biome-ignore lint/suspicious/noThenProperty: Neon queries are lazy promises; this fixture preserves that transactional protocol.
				then: (
					resolve: (value: QueryResult) => unknown,
					reject: (error: unknown) => unknown,
				) => execute(pool).then(resolve, reject),
			};
		},
	);
	transport.transaction.mockImplementation(async (requests: Request[]) => {
		const client = await pool.connect();
		await client.query("begin");
		try {
			const results: QueryResult[] = [];
			for (const request of requests)
				results.push(await request.execute(client));
			await client.query("commit");
			return results;
		} catch (error) {
			await client.query("rollback");
			throw error;
		} finally {
			client.release();
		}
	});
	return pool;
}

export async function resetIntegrationDatabase(pool: Pool) {
	await pool.query("drop schema public cascade; create schema public");
	// Historical 0001 drops a pre-Drizzle table that is absent from 0000.
	await pool.query("create table todos(id integer)");
	const directory = new URL("../../drizzle/", import.meta.url);
	for (const file of readdirSync(directory)
		.filter((name) => name.endsWith(".sql"))
		.sort())
		await pool.query(readFileSync(new URL(file, directory), "utf8"));
	await pool.query(`
insert into "user"(id,name,email) values('fixture-user','Fixture','fixture@example.invalid'),('other-user','Other','other@example.invalid');
insert into portfolios(id,user_id,name,currency,review_timezone) values(1,'fixture-user','A','USD','UTC'),(2,'fixture-user','B','USD','Asia/Bangkok'),(3,'other-user','Other','USD','UTC');
select setval('portfolios_id_seq',3);`);
}
