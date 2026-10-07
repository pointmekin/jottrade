export const QUALITY_WORKFLOW = ".github/workflows/quality.yml";

// The main ruleset requires these checks by job name; see docs/quality-gate.md.
export const REQUIRED_JOBS = [
	{ id: "quality", name: "Quality", command: "bun run quality" },
	{ id: "build", name: "Build", command: "bun run build" },
	{ id: "e2e", name: "E2E", command: "bun run verify" },
] as const;

type RequiredJob = (typeof REQUIRED_JOBS)[number];

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

function stepProblems(required: RequiredJob, steps: unknown): string[] {
	const commands = (Array.isArray(steps) ? steps : [])
		.filter(isMapping)
		.map((step) => String(step.run ?? ""));
	const problems: string[] = [];
	if (!commands.some((run) => run.includes("bun install --frozen-lockfile"))) {
		problems.push(
			`The ${required.id} job must install with bun install --frozen-lockfile.`,
		);
	}
	if (!commands.some((run) => run.includes(required.command))) {
		problems.push(`The ${required.id} job must run ${required.command}.`);
	}
	return problems;
}

function jobProblems(required: RequiredJob, job: unknown): string[] {
	if (!isMapping(job)) {
		return [`The workflow must define the ${required.id} job.`];
	}
	const problems: string[] = [];
	if (job.name !== required.name) {
		problems.push(
			`The ${required.id} job must be named "${required.name}", the required check name.`,
		);
	}
	if ("if" in job) {
		problems.push(
			`The ${required.id} job must not have an if condition: a skipped job does not block merging.`,
		);
	}
	return [...problems, ...stepProblems(required, job.steps)];
}

// Returns the ways the parsed quality workflow breaks the merge contract.
export function checkQualityWorkflow(workflow: unknown): string[] {
	if (!isMapping(workflow)) {
		return ["The workflow is not a YAML mapping."];
	}
	const jobs = isMapping(workflow.jobs) ? workflow.jobs : {};
	return [
		...triggerProblems(workflow.on),
		...REQUIRED_JOBS.flatMap((required) =>
			jobProblems(required, jobs[required.id]),
		),
	];
}
