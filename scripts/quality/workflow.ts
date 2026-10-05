export const QUALITY_WORKFLOW = ".github/workflows/quality.yml";
export const QUALITY_JOB = "quality";
// Rulesets require this check by name; see docs/quality-gate.md.
export const QUALITY_CHECK_NAME = "Quality";

type Mapping = Record<string, unknown>;

const isMapping = (value: unknown): value is Mapping =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function triggerProblems(on: unknown): string[] {
	const triggers = isMapping(on) ? on : {};
	if (!("pull_request" in triggers)) {
		return ["The workflow must run on pull_request."];
	}
	const pullRequest = triggers.pull_request;
	if (!isMapping(pullRequest)) {
		return [];
	}
	return ["paths", "paths-ignore"]
		.filter((filter) => filter in pullRequest)
		.map(
			(filter) =>
				`pull_request must not use ${filter}: a skipped run leaves the required check pending.`,
		);
}

function stepProblems(steps: unknown): string[] {
	const commands = (Array.isArray(steps) ? steps : [])
		.filter(isMapping)
		.map((step) => String(step.run ?? ""));
	const problems: string[] = [];
	if (!commands.some((run) => run.includes("bun install --frozen-lockfile"))) {
		problems.push("The job must install with bun install --frozen-lockfile.");
	}
	if (!commands.some((run) => run.includes("bun run quality"))) {
		problems.push("The job must run bun run quality.");
	}
	return problems;
}

// Returns the ways the parsed quality workflow breaks the merge contract.
export function checkQualityWorkflow(workflow: unknown): string[] {
	if (!isMapping(workflow)) {
		return ["The workflow is not a YAML mapping."];
	}
	const jobs = isMapping(workflow.jobs) ? workflow.jobs : {};
	const job = jobs[QUALITY_JOB];
	if (!isMapping(job)) {
		return [`The workflow must define the ${QUALITY_JOB} job.`];
	}
	const problems = triggerProblems(workflow.on);
	if (job.name !== QUALITY_CHECK_NAME) {
		problems.push(
			`The ${QUALITY_JOB} job must be named "${QUALITY_CHECK_NAME}", the required check name.`,
		);
	}
	if ("if" in job) {
		problems.push(
			`The ${QUALITY_JOB} job must not have an if condition: a skipped job does not block merging.`,
		);
	}
	return [...problems, ...stepProblems(job.steps)];
}
