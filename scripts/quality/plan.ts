import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Change, ChangeStatus } from "./changes";

export const Check = {
	Build: "build",
	BiomeConfig: "biome-config",
	EslintProject: "eslint-project",
	Lockfile: "lockfile",
	Workflows: "workflows",
} as const;

export type Check = (typeof Check)[keyof typeof Check];

export const FileList = {
	Biome: "biome",
	Sonar: "sonar",
	Doctor: "doctor",
	Shell: "shell",
} as const;

export type FileList = (typeof FileList)[keyof typeof FileList];

export type QualityPlan = {
	files: Record<FileList, string[]>;
	checks: Partial<Record<Check, string[]>>;
};

// TanStack Router writes this file from src/routes on every dev start and
// build, so a lint finding in it cannot be fixed by hand. tsc still checks it,
// and the build check fails when the committed copy is out of date.
export const GENERATED_FILES = ["src/routeTree.gen.ts"];

const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
const SHELL_FILE = /\.sh$/;
const ALL_CHECKS = Object.values(Check);

type Rule = {
	matches: (change: Change) => boolean;
	checks: Check[];
};

const isOneOf =
	(...paths: string[]) =>
	(change: Change) =>
		paths.includes(change.path);

const isUnder =
	(...prefixes: string[]) =>
	(change: Change) =>
		prefixes.some((prefix) => change.path.startsWith(prefix));

const addsOrRemovesRoute = (change: Change) =>
	change.path.startsWith("src/routes/") &&
	change.status !== ChangeStatus.Modified;

const RULES: Rule[] = [
	{
		matches: isOneOf("package.json", "bun.lock"),
		checks: [Check.Build, Check.Lockfile, Check.EslintProject],
	},
	{
		matches: isOneOf(".bun-version", ".nvmrc"),
		checks: [Check.Build, Check.Lockfile],
	},
	{ matches: isOneOf("biome.json"), checks: [Check.BiomeConfig] },
	{ matches: isOneOf("eslint.config.js"), checks: [Check.EslintProject] },
	{
		matches: isOneOf(
			"vite.config.ts",
			"tsconfig.json",
			"neon-vite-plugin.ts",
			"wrangler.jsonc",
			"vercel.json",
			"src/styles.css",
			...GENERATED_FILES,
		),
		checks: [Check.Build],
	},
	{ matches: isUnder("src/components/ui/"), checks: [Check.Build] },
	{ matches: addsOrRemovesRoute, checks: [Check.Build] },
	{ matches: isUnder(".github/workflows/"), checks: [Check.Workflows] },
	{
		matches: (change) =>
			change.path === "scripts/quality.sh" ||
			isUnder("scripts/quality/")(change),
		checks: ALL_CHECKS,
	},
];

function selectChecks(changes: Change[]): QualityPlan["checks"] {
	const checks: QualityPlan["checks"] = {};
	for (const change of changes) {
		for (const rule of RULES.filter((candidate) => candidate.matches(change))) {
			for (const check of rule.checks) {
				const reasons = checks[check] ?? [];
				checks[check] = reasons.includes(change.path)
					? reasons
					: [...reasons, change.path];
			}
		}
	}
	return checks;
}

export function planChecks(changes: Change[]): QualityPlan {
	const present = [
		...new Set(
			changes
				.filter((change) => change.status !== ChangeStatus.Deleted)
				.map((change) => change.path)
				.filter((path) => !GENERATED_FILES.includes(path)),
		),
	].sort();
	const scripts = present.filter((path) => SCRIPT_FILE.test(path));
	return {
		files: {
			biome: present,
			sonar: scripts,
			doctor: scripts,
			shell: present.filter((path) => SHELL_FILE.test(path)),
		},
		checks: selectChecks(changes),
	};
}

// `xargs` appends paths after the tool's options, so a file named `-x.sh` or
// `--write` would be read as an option. `./` keeps it a path.
export function asArgument(path: string): string {
	return path.startsWith("-") ? `./${path}` : path;
}

// NUL-separated lists keep paths with spaces or newlines intact for `xargs -0`.
export function writePlan(dir: string, plan: QualityPlan): void {
	for (const [list, paths] of Object.entries(plan.files)) {
		writeFileSync(
			join(dir, list),
			paths.map((path) => `${asArgument(path)}\0`).join(""),
		);
	}
	writeFileSync(
		join(dir, "checks"),
		Object.keys(plan.checks)
			.map((check) => `${check}\n`)
			.join(""),
	);
}

export function describePlan(base: string, plan: QualityPlan): string {
	const lines = [
		`Files changed since ${base} for Biome: ${plan.files.biome.length}, SonarJS and React Doctor: ${plan.files.sonar.length}.`,
	];
	const checks = Object.entries(plan.checks);
	if (checks.length === 0) {
		lines.push("No tooling, config, shared UI or route changes.");
	}
	for (const [check, paths] of checks) {
		lines.push(`Focused check ${check}: ${paths.join(", ")}`);
	}
	return lines.join("\n");
}
