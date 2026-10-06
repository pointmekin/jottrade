import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";

export const ENV_FILE = ".env";
const TEMPLATE = ".env.example";

export function readEnvFile(path = ENV_FILE): Record<string, string> {
	return existsSync(path) ? parse(readFileSync(path)) : {};
}

/**
 * Fills empty keys in `.env` (created from the template when missing) and
 * never replaces a value that is already set.
 */
export function fillEnvFile(values: Record<string, string>, path = ENV_FILE) {
	let text = existsSync(path)
		? readFileSync(path, "utf8")
		: readFileSync(TEMPLATE, "utf8");
	const current = parse(text);
	const filled: string[] = [];
	for (const [key, value] of Object.entries(values)) {
		if (current[key]) continue;
		const line = new RegExp(`^${key}=.*$`, "m");
		text = line.test(text)
			? text.replace(line, `${key}=${value}`)
			: `${text.trimEnd()}\n${key}=${value}\n`;
		filled.push(key);
	}
	writeFileSync(path, text, { mode: 0o600 });
	return filled;
}

export function localEnvValues(databaseUrl: string): Record<string, string> {
	return {
		DATABASE_URL: databaseUrl,
		DATABASE_DRIVER: "pg",
		BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
		BETTER_AUTH_URL: "http://localhost:3000",
	};
}
