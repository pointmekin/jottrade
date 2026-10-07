import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { truncateTables, withClient } from "./database";
import { buildSeedData } from "./seed-data";
import type { Target } from "./target";

const SERIAL_TABLES = [
	"portfolios",
	"strategies",
	"trades",
	"cash_flows",
	"tags",
];

/** Replaces every row with the synthetic data set, in one transaction. */
export async function seedDatabase(target: Target) {
	const data = buildSeedData();
	await withClient(target.url.toString(), async (client) => {
		const db = drizzle(client, { schema });
		await client.query("begin");
		try {
			await truncateTables(client);
			await db.insert(schema.user).values(data.users);
			await db.insert(schema.account).values(data.credentials);
			await db.insert(schema.portfolios).values(data.portfolios);
			await db.insert(schema.strategies).values(data.strategies);
			await db.insert(schema.trades).values(data.trades);
			await db.insert(schema.cashFlows).values(data.cashFlows);
			await db.insert(schema.tags).values(data.tags);
			await db.insert(schema.tradeTags).values(data.tradeTags);
			// Explicit ids leave the sequences behind; the app's inserts follow them.
			for (const table of SERIAL_TABLES)
				await db.execute(
					sql.raw(
						`select setval(pg_get_serial_sequence('${table}', 'id'), coalesce(max(id), 0) + 1, false) from ${table}`,
					),
				);
			await client.query("commit");
		} catch (cause) {
			await client.query("rollback");
			throw cause;
		}
	});
	return data;
}
