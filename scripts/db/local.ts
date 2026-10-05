import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { isValidDatabaseName } from "./target";

// A port away from 5432, so a system PostgreSQL is never picked by accident.
export const LOCAL_HOST = "127.0.0.1";
export const LOCAL_USER = "jottrade";
// Local-only credential: the server listens on 127.0.0.1 and holds synthetic data.
export const LOCAL_PASSWORD = "jottrade";

export function localPort(env = process.env) {
	return Number(env.JOTTRADE_PG_PORT ?? 54329);
}

export function localDataDir(env = process.env) {
	if (env.JOTTRADE_PG_DIR) return env.JOTTRADE_PG_DIR;
	// Root cannot run postgres, and the postgres user cannot enter /root.
	if (process.getuid?.() === 0) return "/var/lib/jottrade/postgres";
	const state = env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
	return join(state, "jottrade", "postgres");
}

/**
 * One database per worktree: the folder name keeps it readable and a hash of
 * the full path keeps two checkouts with the same folder name apart.
 */
export function worktreeDatabaseName(root = process.cwd()) {
	const path = realpathSync(root);
	const slug = basename(path)
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.join("_")
		.slice(0, 24);
	const hash = createHash("sha256").update(path).digest("hex").slice(0, 8);
	return ["jottrade_dev", slug, hash].filter(Boolean).join("_");
}

export function localUrl(database: string, env = process.env) {
	if (!isValidDatabaseName(database))
		throw new Error(
			`"${database}" is not a valid jottrade_dev_* or jottrade_test_* name.`,
		);
	return `postgresql://${LOCAL_USER}:${LOCAL_PASSWORD}@${LOCAL_HOST}:${localPort(env)}/${database}`;
}

export function adminUrl(env = process.env) {
	return `postgresql://${LOCAL_USER}:${LOCAL_PASSWORD}@${LOCAL_HOST}:${localPort(env)}/postgres`;
}
