/**
 * Decides whether a command may write to, migrate or drop DATABASE_URL.
 * Pure, so the rules are unit-tested without a database.
 */

// Postgres truncates identifiers longer than 63 bytes.
export const DATABASE_NAME_PATTERN = /^jottrade_(dev|test)(_[a-z0-9_]+)?$/;
const MAX_IDENTIFIER_LENGTH = 63;
const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "[::1]"]);

export type TargetEnv = {
	DATABASE_URL?: string;
	NODE_ENV?: string;
	JOTTRADE_DB_ALLOW_REMOTE_HOST?: string;
};

export type Target = { url: URL; database: string; host: string };

export type TargetCheck =
	| ({ ok: true } & Target)
	| { ok: false; reason: string };

export function isValidDatabaseName(name: string) {
	return (
		name.length <= MAX_IDENTIFIER_LENGTH && DATABASE_NAME_PATTERN.test(name)
	);
}

function parse(raw: string): URL | undefined {
	try {
		return new URL(raw);
	} catch {
		return undefined;
	}
}

function isLocal(url: URL) {
	const socket = url.searchParams.get("host");
	if (socket) return socket.startsWith("/");
	return LOCAL_HOSTS.has(url.hostname);
}

export function checkTarget(env: TargetEnv): TargetCheck {
	if (!env.DATABASE_URL)
		return {
			ok: false,
			reason:
				"DATABASE_URL is not set. Run `npm run db:setup` for a local database, or set DATABASE_URL to a jottrade_dev_* or jottrade_test_* database.",
		};
	if (env.NODE_ENV === "production")
		return { ok: false, reason: "NODE_ENV is production." };
	const url = parse(env.DATABASE_URL);
	if (!url || !["postgres:", "postgresql:"].includes(url.protocol))
		return {
			ok: false,
			reason: "DATABASE_URL is not a postgres:// connection string.",
		};
	const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
	if (!isValidDatabaseName(database))
		return {
			ok: false,
			reason: `Database "${database}" is not an explicit development or test target. Its name must match ${DATABASE_NAME_PATTERN} and be at most ${MAX_IDENTIFIER_LENGTH} characters.`,
		};
	const host = url.searchParams.get("host") ?? url.hostname;
	if (!isLocal(url) && env.JOTTRADE_DB_ALLOW_REMOTE_HOST !== url.hostname)
		return {
			ok: false,
			reason: `Host "${url.hostname}" is not local. Set JOTTRADE_DB_ALLOW_REMOTE_HOST=${url.hostname} only if it is a disposable development branch, never production.`,
		};
	return { ok: true, url, database, host };
}

/** The URL without its password, for logs. */
export function redact(url: URL) {
	const copy = new URL(url);
	if (copy.password) copy.password = "***";
	return copy.toString();
}

export function requireTarget(env: TargetEnv = process.env): Target {
	const check = checkTarget(env);
	if (!check.ok) throw new Error(`Refusing database target: ${check.reason}`);
	return check;
}
