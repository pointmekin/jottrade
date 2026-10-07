import { describe, expect, it } from "vitest";
import { checkQualityWorkflow } from "../../scripts/quality/workflow";

const job = (name: string, command: string) => ({
	name,
	steps: [
		{ uses: "actions/checkout@v4" },
		{ run: "bun install --frozen-lockfile" },
		{ run: command },
	],
});
const validWorkflow = () => ({
	name: "Quality",
	on: { pull_request: null, merge_group: null },
	jobs: {
		quality: job("Quality", "bun run quality"),
		build: job("Build", "bun run build"),
		e2e: job("E2E", "bun run verify"),
	},
});

describe("quality workflow contract", () => {
	it("accepts the required check shape", () => {
		expect(checkQualityWorkflow(validWorkflow())).toEqual([]);
	});

	it("rejects a renamed check", () => {
		const workflow = validWorkflow();
		workflow.jobs.quality.name = "quality";

		expect(checkQualityWorkflow(workflow)).toEqual([
			'The quality job must be named "Quality", the required check name.',
		]);
	});

	it("rejects path filters that leave the required check pending", () => {
		const workflow = {
			...validWorkflow(),
			on: { pull_request: { paths: ["src/**"], "paths-ignore": ["docs/**"] } },
		};

		expect(checkQualityWorkflow(workflow)).toHaveLength(2);
	});

	it("rejects a workflow that no longer runs on pull requests", () => {
		const workflow = { ...validWorkflow(), on: { push: null } };

		expect(checkQualityWorkflow(workflow)).toEqual([
			"The workflow must run on pull_request.",
		]);
	});

	it("rejects a conditional job and an unfrozen install", () => {
		const workflow = validWorkflow();
		const quality = {
			...workflow.jobs.quality,
			if: "github.actor != 'dependabot[bot]'",
			steps: [{ run: "bun install" }, { run: "bun run quality" }],
		};

		expect(
			checkQualityWorkflow({
				...workflow,
				jobs: { ...workflow.jobs, quality },
			}),
		).toEqual([
			"The quality job must not have an if condition: a skipped job does not block merging.",
			"The quality job must install with bun install --frozen-lockfile.",
		]);
	});

	it("rejects a workflow without a required job", () => {
		const { quality, build } = validWorkflow().jobs;

		expect(
			checkQualityWorkflow({ ...validWorkflow(), jobs: { quality, build } }),
		).toEqual(["The workflow must define the e2e job."]);
	});

	it("rejects a renamed build or E2E check and a missing command", () => {
		const workflow = validWorkflow();
		workflow.jobs.build.name = "build";
		workflow.jobs.e2e = job("E2E", "bun run test");

		expect(checkQualityWorkflow(workflow)).toEqual([
			'The build job must be named "Build", the required check name.',
			"The e2e job must run bun run verify.",
		]);
	});
});
