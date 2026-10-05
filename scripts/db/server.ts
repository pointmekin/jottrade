import { execFileSync, spawnSync } from "node:child_process";
import {
	chownSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	LOCAL_HOST,
	LOCAL_PASSWORD,
	LOCAL_USER,
	localDataDir,
	localPort,
} from "./local";

const CONTAINER = "jottrade-postgres";
const IMAGE = "postgres:16-alpine";

function canConnect(port: number) {
	return new Promise<boolean>((resolve) => {
		const socket = createConnection({ host: LOCAL_HOST, port });
		socket.once("connect", () => {
			socket.end();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
	});
}

async function waitForPort(port: number, seconds: number) {
	for (let i = 0; i < seconds * 4; i++) {
		if (await canConnect(port)) return true;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	return false;
}

const SYSTEM_DIRS = [
	"/usr/local/bin",
	"/usr/bin",
	"/bin",
	"/usr/sbin",
	"/sbin",
];

/** Resolves a command to an absolute path, so it never runs from a relative PATH entry. */
function findExecutable(name: string) {
	const dirs = [...(process.env.PATH ?? "").split(":"), ...SYSTEM_DIRS];
	const dir = dirs.find(
		(entry) => entry.startsWith("/") && existsSync(join(entry, name)),
	);
	if (!dir) throw new Error(`${name} is not installed.`);
	return join(dir, name);
}

function hasBinary(dir: string) {
	return existsSync(join(dir, "pg_ctl")) && existsSync(join(dir, "initdb"));
}

function findBinDir(env = process.env) {
	if (env.JOTTRADE_PG_BIN) return env.JOTTRADE_PG_BIN;
	const candidates = [...(env.PATH ?? "").split(":"), "/usr/local/pgsql/bin"];
	for (const root of [
		"/usr/lib/postgresql",
		"/opt/homebrew/opt",
		"/usr/local/opt",
	]) {
		if (!existsSync(root)) continue;
		const versions = readdirSync(root)
			.filter((name) => /^(postgresql@)?\d+$/.test(name))
			.sort(
				(a, b) => Number(b.replace(/\D/g, "")) - Number(a.replace(/\D/g, "")),
			);
		candidates.push(...versions.map((name) => join(root, name, "bin")));
	}
	const dir = candidates.find(
		(candidate) => candidate.startsWith("/") && hasBinary(candidate),
	);
	if (!dir)
		throw new Error(
			"No PostgreSQL server binaries (initdb, pg_ctl) found. Install PostgreSQL, set JOTTRADE_PG_BIN, or use JOTTRADE_PG_MODE=docker.",
		);
	return dir;
}

/** Runs a server binary, as the postgres user when this process is root. */
function run(bin: string, args: string[]) {
	const asRoot = process.getuid?.() === 0;
	const [command, commandArgs] = asRoot
		? [findExecutable("runuser"), ["-u", "postgres", "--", bin, ...args]]
		: [bin, args];
	execFileSync(command, commandArgs, { stdio: "inherit" });
}

function prepareDataDir(dir: string) {
	mkdirSync(dirname(dir), { recursive: true });
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	chownTo(dir);
}

/** As root, hands a path to the postgres user that runs the server. */
function chownTo(path: string) {
	if (process.getuid?.() !== 0) return;
	const entry = readFileSync("/etc/passwd", "utf8")
		.split("\n")
		.map((line) => line.split(":"))
		.find((fields) => fields[0] === "postgres");
	if (!entry) throw new Error("Running as root needs a postgres system user.");
	chownSync(path, Number(entry[2]), Number(entry[3]));
}

function initCluster(binDir: string, dataDir: string) {
	if (existsSync(join(dataDir, "PG_VERSION"))) return;
	prepareDataDir(dataDir);
	const tempDir = mkdtempSync(join(tmpdir(), "jottrade-initdb-"));
	const pwfile = join(tempDir, "password");
	writeFileSync(pwfile, LOCAL_PASSWORD, { mode: 0o644 });
	chownTo(tempDir);
	try {
		initdb(binDir, dataDir, pwfile);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

function initdb(binDir: string, dataDir: string, pwfile: string) {
	run(join(binDir, "initdb"), [
		"--pgdata",
		dataDir,
		"--username",
		LOCAL_USER,
		"--pwfile",
		pwfile,
		"--auth",
		"scram-sha-256",
		"--encoding",
		"UTF8",
		"--no-locale",
	]);
}

function startNative(port: number) {
	const binDir = findBinDir();
	const dataDir = localDataDir();
	initCluster(binDir, dataDir);
	run(join(binDir, "pg_ctl"), [
		"start",
		"--pgdata",
		dataDir,
		"--wait",
		"--log",
		join(dataDir, "server.log"),
		"-o",
		`-p ${port} -c listen_addresses=${LOCAL_HOST} -k ${dataDir}`,
	]);
}

function startDocker(port: number) {
	const docker = findExecutable("docker");
	const existing = spawnSync(docker, ["start", CONTAINER], {
		stdio: "ignore",
	});
	if (existing.status === 0) return;
	execFileSync(
		docker,
		[
			"run",
			"--detach",
			"--name",
			CONTAINER,
			"--publish",
			`${LOCAL_HOST}:${port}:5432`,
			"--env",
			`POSTGRES_USER=${LOCAL_USER}`,
			"--env",
			`POSTGRES_PASSWORD=${LOCAL_PASSWORD}`,
			"--volume",
			`${CONTAINER}:/var/lib/postgresql/data`,
			IMAGE,
		],
		{ stdio: "inherit" },
	);
}

const dockerMode = () => process.env.JOTTRADE_PG_MODE === "docker";

export async function startServer() {
	const port = localPort();
	if (await canConnect(port)) {
		console.log(`PostgreSQL already listens on ${LOCAL_HOST}:${port}.`);
		return;
	}
	if (dockerMode()) startDocker(port);
	else startNative(port);
	if (!(await waitForPort(port, 30)))
		throw new Error(`PostgreSQL did not start on ${LOCAL_HOST}:${port}.`);
	console.log(`PostgreSQL listens on ${LOCAL_HOST}:${port}.`);
}

export function stopServer() {
	if (dockerMode()) {
		execFileSync(findExecutable("docker"), ["stop", CONTAINER], {
			stdio: "inherit",
		});
		return;
	}
	const dataDir = localDataDir();
	if (!existsSync(join(dataDir, "postmaster.pid"))) {
		console.log("The local PostgreSQL server is not running.");
		return;
	}
	run(join(findBinDir(), "pg_ctl"), [
		"stop",
		"--pgdata",
		dataDir,
		"--mode",
		"fast",
	]);
}

export async function serverStatus() {
	const port = localPort();
	const up = await canConnect(port);
	const where = dockerMode() ? `container ${CONTAINER}` : localDataDir();
	console.log(
		`${up ? "Running" : "Stopped"}: ${LOCAL_HOST}:${port} (${where}).`,
	);
}
