import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Server-only variables from .env.example. A client file that names one, or
// contains its value, reads or leaks a server secret.
export const SERVER_ONLY_ENV = [
	"DATABASE_URL",
	"BETTER_AUTH_SECRET",
	"GOOGLE_CLIENT_SECRET",
	"GCP_SERVICE_ACCOUNT_KEY",
	"GEMINI_API_KEY",
	"RESEND_API_KEY",
];

// Strings that only server-only dependencies contain. The server output must
// contain each one, so a check that finds none in the client is meaningful.
export const SERVER_ONLY_MARKERS: Record<string, string> = {
	"SCRAM-SHA-256": "pg (node-postgres)",
	NeonDbError: "@neondatabase/serverless",
	drizzleAdapter: "better-auth server adapter",
	"storage.googleapis.com": "Google Cloud Storage client (src/lib/gcp.ts)",
};

const CONNECTION_STRING = /postgres(?:ql)?:\/\/[^\s"'`]+@/;
// Shorter values are too likely to match by chance.
const MIN_SECRET_LENGTH = 8;

export type BundleFile = { path: string; content: string };

export function readBundle(directory: string): BundleFile[] {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name))
		.map((path) => ({
			path: relative(directory, path),
			content: readFileSync(path, "latin1"),
		}));
}

export function findClientLeaks(
	files: BundleFile[],
	env: Record<string, string | undefined>,
): string[] {
	const secrets = SERVER_ONLY_ENV.flatMap((name) => {
		const value = env[name];
		return value && value.length >= MIN_SECRET_LENGTH ? [{ name, value }] : [];
	});
	return files.flatMap(({ path, content }) => [
		...SERVER_ONLY_ENV.filter((name) => content.includes(name)).map(
			(name) => `${path}: names the server-only variable ${name}`,
		),
		...secrets
			.filter(({ value }) => content.includes(value))
			.map(({ name }) => `${path}: contains the value of ${name}`),
		...Object.entries(SERVER_ONLY_MARKERS)
			.filter(([marker]) => content.includes(marker))
			.map(
				([marker, source]) => `${path}: contains "${marker}" from ${source}`,
			),
		...(CONNECTION_STRING.test(content)
			? [`${path}: contains a PostgreSQL connection string with credentials`]
			: []),
	]);
}

/** Markers that the server output does not contain, so they prove nothing. */
export function missingServerMarkers(files: BundleFile[]): string[] {
	return Object.keys(SERVER_ONLY_MARKERS).filter(
		(marker) => !files.some(({ content }) => content.includes(marker)),
	);
}
