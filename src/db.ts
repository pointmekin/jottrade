// Neon
import { neon } from "@neondatabase/serverless";

/**
 * Prefer the unprefixed name. Anything called `VITE_*` is inlined into the
 * browser bundle, so a connection string under that name leaks its password.
 * `VITE_DATABASE_URL` stays as a fallback for the existing local `.env`.
 */
function databaseUrl(): string | undefined {
	return process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
}

let client: ReturnType<typeof neon>;

export async function getClient() {
	const url = databaseUrl();
	if (!url) {
		return undefined;
	}
	if (!client) {
		client = neon(url);
	}
	return client;
}

// Drizzle
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./db/schema";

const url = databaseUrl();
if (!url) {
	throw new Error(
		"No database URL. Set DATABASE_URL (preferred) or VITE_DATABASE_URL.",
	);
}

const sql = neon(url);
export const db = drizzle(sql, { schema });
