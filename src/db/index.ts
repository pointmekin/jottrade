import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { createPgTransport } from "./pg-transport";
import * as schema from "./schema";

export const DatabaseDriver = {
	Neon: "neon",
	Pg: "pg",
} as const;

export type DatabaseDriver =
	(typeof DatabaseDriver)[keyof typeof DatabaseDriver];

/**
 * Keep these names unprefixed. Vite inlines anything called `VITE_*` into the
 * browser bundle, so a connection string under that name leaks its password.
 */
function databaseUrl(): string {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error(
			"No database URL. Set DATABASE_URL, or run `npm run db:setup` for a local database.",
		);
	}
	return url;
}

export function databaseDriver(
	value = process.env.DATABASE_DRIVER,
): DatabaseDriver {
	if (!value) return DatabaseDriver.Neon;
	const drivers: string[] = Object.values(DatabaseDriver);
	if (!drivers.includes(value)) {
		throw new Error(
			`DATABASE_DRIVER must be one of ${drivers.join(", ")}; got "${value}".`,
		);
	}
	return value as DatabaseDriver;
}

// Production uses Neon's HTTP driver. `pg` serves a plain PostgreSQL server,
// such as the local development database, through the same drizzle API.
const client =
	databaseDriver() === DatabaseDriver.Pg
		? createPgTransport(databaseUrl())
		: neon(databaseUrl());

export async function getClient() {
	return client;
}

export const db = drizzle(client, { schema });
