import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import type { Target } from "./target";

const MIGRATIONS_FOLDER = "drizzle";

async function withClient<T>(
	url: string,
	work: (client: Client) => Promise<T>,
) {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		return await work(client);
	} finally {
		await client.end();
	}
}

/** The same server and credentials, on the always-present `postgres` database. */
export function maintenanceUrl(target: Target) {
	const url = new URL(target.url);
	url.pathname = "/postgres";
	return url.toString();
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

export async function databaseExists(target: Target) {
	return withClient(maintenanceUrl(target), async (client) => {
		const result = await client.query(
			"select 1 from pg_database where datname = $1",
			[target.database],
		);
		return result.rowCount === 1;
	});
}

export async function createDatabase(target: Target) {
	if (await databaseExists(target)) return false;
	await withClient(maintenanceUrl(target), (client) =>
		client.query(`create database ${quote(target.database)}`),
	);
	return true;
}

export async function dropDatabase(target: Target) {
	await withClient(maintenanceUrl(target), (client) =>
		client.query(
			`drop database if exists ${quote(target.database)} with (force)`,
		),
	);
}

export async function listDatabases(serverUrl: string) {
	return withClient(serverUrl, async (client) => {
		const result = await client.query<{ datname: string }>(
			"select datname from pg_database where datname like 'jottrade\\_%' order by datname",
		);
		return result.rows.map((row) => row.datname);
	});
}

async function appliedMigrations(client: Client) {
	const table = await client.query(
		"select to_regclass('drizzle.__drizzle_migrations') is not null as present",
	);
	if (!table.rows[0].present) return 0;
	const count = await client.query(
		"select count(*)::int as count from drizzle.__drizzle_migrations",
	);
	return count.rows[0].count as number;
}

export async function migrateDatabase(target: Target) {
	await withClient(target.url.toString(), async (client) => {
		// Migration 0001 drops a pre-Drizzle `todos` table that 0000 never
		// creates, so a database with no recorded migration needs it first.
		if ((await appliedMigrations(client)) === 0)
			await client.query("create table if not exists todos (id integer)");
		await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
	});
}

export async function clearDatabase(target: Target) {
	await withClient(target.url.toString(), (client) =>
		client.query(
			"drop schema if exists drizzle cascade; drop schema public cascade; create schema public;",
		),
	);
}

/** Empties every application table, so seeding starts from known ids. */
export async function truncateTables(client: Client) {
	const result = await client.query<{ name: string }>(
		"select quote_ident(tablename) as name from pg_tables where schemaname = 'public'",
	);
	if (result.rowCount === 0)
		throw new Error("No tables. Run `npm run db:dev:migrate` first.");
	await client.query(
		`truncate ${result.rows.map((row) => row.name).join(", ")} restart identity cascade`,
	);
}

export { withClient };
