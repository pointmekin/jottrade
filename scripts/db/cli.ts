import { config } from "dotenv";
import {
	clearDatabase,
	createDatabase,
	dropDatabase,
	listDatabases,
	maintenanceUrl,
	migrateDatabase,
} from "./database";
import { ENV_FILE, fillEnvFile, localEnvValues, readEnvFile } from "./env-file";
import {
	adminUrl,
	LOCAL_HOST,
	localPort,
	localUrl,
	worktreeDatabaseName,
} from "./local";
import { seedDatabase } from "./seed";
import { serverStatus, startServer, stopServer } from "./server";
import { checkTarget, redact, requireTarget, type Target } from "./target";

const USAGE = `Usage: tsx scripts/db/cli.ts <command>

  setup          Start local PostgreSQL, create this worktree's database,
                 fill empty .env keys, migrate and seed.
  migrate        Apply drizzle/ migrations to DATABASE_URL.
  seed           Replace all rows in DATABASE_URL with synthetic data.
  reset          Drop every table in DATABASE_URL, migrate and seed.
  drop           Drop the DATABASE_URL database.
  check          Report whether DATABASE_URL is a safe target. Writes nothing.
  list           List jottrade_* databases on the target's server.
  server <start|stop|status>
                 Manage the local PostgreSQL server.

Every command except server and list refuses a target that is not a
jottrade_dev_* or jottrade_test_* database on a local host.`;

// `.env` never overrides a value already in the environment.
config({ path: ENV_FILE, quiet: true });

function isLocalServer(target: Target) {
	return (
		target.url.hostname === LOCAL_HOST &&
		Number(target.url.port) === localPort()
	);
}

function describe(target: Target) {
	return `${target.database} (${redact(target.url)})`;
}

/** The local URL to write, or an error when `.env` already names another target. */
function setupTarget(): Target {
	if (process.env.DATABASE_URL) return requireTarget();
	const name = process.env.JOTTRADE_DB_NAME ?? worktreeDatabaseName();
	const url = localUrl(name);
	const filled = fillEnvFile(localEnvValues(url));
	if (filled.length) console.log(`Wrote ${filled.join(", ")} to ${ENV_FILE}.`);
	process.env.DATABASE_URL = url;
	return requireTarget();
}

async function setup() {
	const fileUrl = readEnvFile().DATABASE_URL;
	if (fileUrl) {
		const check = checkTarget({ ...process.env, DATABASE_URL: fileUrl });
		if (!check.ok)
			throw new Error(
				`${ENV_FILE} already sets DATABASE_URL to an unsafe target, and setup never overwrites it. ${check.reason} Move that value out of ${ENV_FILE}, and keep production credentials outside the repository, then run setup again.`,
			);
	}
	const target = setupTarget();
	if (isLocalServer(target)) await startServer();
	const created = await createDatabase(target);
	console.log(`${created ? "Created" : "Using"} ${describe(target)}.`);
	await migrateDatabase(target);
	await seed(target);
	console.log("Ready. Start the app with `npm run dev`.");
}

async function seed(target: Target) {
	const data = await seedDatabase(target);
	console.log(
		`Seeded ${data.users.length} users, ${data.portfolios.length} accounts, ${data.trades.length} trades, ${data.cashFlows.length} cash flows, ${data.strategies.length} strategies into ${target.database}.`,
	);
}

async function reset(target: Target) {
	if (isLocalServer(target)) await startServer();
	await createDatabase(target);
	await clearDatabase(target);
	await migrateDatabase(target);
	console.log(`Reset ${describe(target)}.`);
	await seed(target);
}

async function list() {
	const check = checkTarget(process.env);
	const server = check.ok ? maintenanceUrl(check) : adminUrl();
	console.log(`Server: ${redact(new URL(server))}`);
	const names = await listDatabases(server);
	console.log(names.length ? names.join("\n") : "No jottrade_* databases.");
}

async function server(action: string | undefined) {
	if (action === "start") return startServer();
	if (action === "stop") return stopServer();
	if (action === "status") return serverStatus();
	throw new Error(USAGE);
}

async function main([command, ...args]: string[]) {
	switch (command) {
		case "setup":
			return setup();
		case "migrate": {
			const target = requireTarget();
			await migrateDatabase(target);
			return console.log(`Migrated ${describe(target)}.`);
		}
		case "seed":
			return seed(requireTarget());
		case "reset":
			return reset(requireTarget());
		case "drop": {
			const target = requireTarget();
			await dropDatabase(target);
			return console.log(`Dropped ${describe(target)}.`);
		}
		case "check":
			return console.log(`Safe target: ${describe(requireTarget())}.`);
		case "list":
			return list();
		case "server":
			return server(args[0]);
		default:
			throw new Error(USAGE);
	}
}

main(process.argv.slice(2)).catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
