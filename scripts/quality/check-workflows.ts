import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkQualityWorkflow, QUALITY_WORKFLOW } from "./workflow";

type BunYaml = { YAML: { parse: (source: string) => unknown } };

const bun = (globalThis as { Bun?: BunYaml }).Bun;
if (!bun) {
	console.error(
		"Run this script with Bun: bun scripts/quality/check-workflows.ts",
	);
	process.exit(2);
}

const directory = ".github/workflows";
const problems: string[] = [];
const parsed = new Map<string, unknown>();

for (const name of readdirSync(directory).filter((file) =>
	/\.ya?ml$/.test(file),
)) {
	const path = join(directory, name);
	try {
		parsed.set(path, bun.YAML.parse(readFileSync(path, "utf8")));
	} catch (error) {
		problems.push(`${path}: ${error instanceof Error ? error.message : error}`);
	}
}

if (parsed.has(QUALITY_WORKFLOW)) {
	for (const problem of checkQualityWorkflow(parsed.get(QUALITY_WORKFLOW))) {
		problems.push(`${QUALITY_WORKFLOW}: ${problem}`);
	}
} else if (!problems.some((problem) => problem.startsWith(QUALITY_WORKFLOW))) {
	problems.push(`${QUALITY_WORKFLOW} is missing.`);
}

if (problems.length > 0) {
	console.error(problems.join("\n"));
	process.exit(1);
}
console.log(
	`Workflows parse, and ${QUALITY_WORKFLOW} keeps the required check contract.`,
);
