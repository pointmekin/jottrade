import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { localUrl } from "../db/local";

const USAGE = `Usage: npm run verify -- [--no-build] [playwright test arguments]

Creates a disposable jottrade_test_* database on the local PostgreSQL server,
seeds it, builds the app, checks the client bundle, runs the database
isolation tests and the Playwright suite against the production build, then
drops the database.

  --no-build   Reuse the existing .output/ build.`;

const DEFAULT_PORT = 3101;
const SERVER_ENTRY = ".output/server/index.mjs";
const DATABASE_TESTS = [
	"src/test/user-isolation.integration.test.ts",
	"src/test/strategy-isolation.integration.test.ts",
	"src/test/sign-up-provisioning.integration.test.ts",
	"src/test/password-recovery.integration.test.ts",
	"src/test/session-revocation.integration.test.ts",
	"src/test/account-deletion.integration.test.ts",
];
// Blank optional integrations, so a developer's .env never reaches the run.
const BLANK_KEYS = [
	"GOOGLE_CLIENT_ID",
	"GOOGLE_CLIENT_SECRET",
	"GCP_BUCKET_NAME",
	"GCP_SERVICE_ACCOUNT_KEY",
	"GEMINI_API_KEY",
	"RESEND_API_KEY",
	"EMAIL_FROM",
];

let interrupted = false;
let active: ChildProcess | undefined;
// Stop the running step, then let `finally` drop the database.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		interrupted = true;
		active?.kill(signal);
	});
}

function canListen(port: number, host?: string): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer()
			.once("error", () => resolve(false))
			.once("listening", () => server.close(() => resolve(true)))
			.listen(port, host);
	});
}

// The app listens on all interfaces, and the suite calls 127.0.0.1.
async function portIsFree(port: number) {
	return (await canListen(port)) && (await canListen(port, "127.0.0.1"));
}

function anyFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer()
			.once("error", reject)
			.listen(0, "127.0.0.1", () => {
				const address = server.address();
				const port = typeof address === "object" && address ? address.port : 0;
				server.close(() => resolve(port));
			});
	});
}

function bin(name: string) {
	return join("node_modules", ".bin", name);
}

function exec(command: string, args: string[], env: NodeJS.ProcessEnv) {
	return new Promise<{ code: number | null; signal: string | null }>(
		(resolve, reject) => {
			const child = spawn(command, args, { stdio: "inherit", env });
			active = child;
			child.once("error", reject);
			child.once("close", (code, signal) => {
				active = undefined;
				resolve({ code, signal });
			});
		},
	);
}

async function run(
	label: string,
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
) {
	if (interrupted) throw new Error("Interrupted.");
	console.log(`\n▶ ${label}`);
	const { code, signal } = await exec(command, args, env);
	if (interrupted || signal) throw new Error("Interrupted.");
	if (code !== 0) throw new Error(`${label} failed with exit code ${code}.`);
}

const tsx = (script: string, ...args: string[]): [string, string[]] => [
	process.execPath,
	["--import", "tsx", script, ...args],
];

async function main(argv: string[]) {
	if (argv.includes("--help")) return console.log(USAGE);
	const shouldBuild = !argv.includes("--no-build");
	const playwrightArgs = argv.filter((arg) => arg !== "--no-build");

	const port = (await portIsFree(DEFAULT_PORT))
		? DEFAULT_PORT
		: await anyFreePort();
	const baseUrl = `http://127.0.0.1:${port}`;
	const database = `jottrade_test_verify_${randomBytes(4).toString("hex")}`;
	const databaseUrl = localUrl(database);
	// The db CLI refuses NODE_ENV=production, and Vite picks its own mode.
	const inherited = { ...process.env };
	delete inherited.NODE_ENV;
	const env: NodeJS.ProcessEnv = {
		...inherited,
		...Object.fromEntries(BLANK_KEYS.map((key) => [key, ""])),
		DATABASE_URL: databaseUrl,
		DATABASE_DRIVER: "pg",
		BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
		BETTER_AUTH_URL: baseUrl,
		PORT: String(port),
		VERIFY_BASE_URL: baseUrl,
		VERIFY_DATABASE_URL: databaseUrl,
	};

	console.log(`Database: ${database}. App: ${baseUrl}.`);
	try {
		await run(
			"Database: create, migrate, seed",
			...tsx("scripts/db/cli.ts", "reset"),
			env,
		);
		if (shouldBuild) {
			await run("Production build", bin("vite"), ["build"], env);
		} else if (!existsSync(SERVER_ENTRY)) {
			throw new Error(`--no-build needs an existing ${SERVER_ENTRY}.`);
		}
		await run(
			"Client bundle check",
			...tsx(
				"scripts/verify/check-client-bundle.ts",
				".output/public",
				".output/server",
			),
			env,
		);
		// One file at a time: the files share the seeded database and compare snapshots.
		await run(
			"Database tests",
			bin("vitest"),
			["run", "--no-file-parallelism", ...DATABASE_TESTS],
			env,
		);
		await run("Browser suite", bin("playwright"), ["test", ...playwrightArgs], {
			...env,
			NODE_ENV: "production",
		});
		console.log("\n✔ Verification passed.");
	} finally {
		console.log(`\n▶ Cleanup: drop ${database}`);
		const [command, args] = tsx("scripts/db/cli.ts", "drop");
		const drop = await exec(command, args, env).catch((error: unknown) => {
			console.error(error);
			return { code: 1 };
		});
		if (drop.code !== 0) {
			process.exitCode = 1;
			console.error(
				`Cleanup failed. Drop ${database} by hand (npm run db:list).`,
			);
		}
	}
}

main(process.argv.slice(2)).catch((error) => {
	console.error(`\n✘ ${error instanceof Error ? error.message : error}`);
	console.error(
		"Evidence: playwright-report/ (open with `npx playwright show-report`) and test-results/ (traces, screenshots).",
	);
	process.exit(1);
});
