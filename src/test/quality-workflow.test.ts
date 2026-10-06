import { describe, expect, it } from "vitest";
import { checkQualityWorkflow } from "../../scripts/quality/workflow";

const validWorkflow = () => ({
	name: "Quality",
	on: { pull_request: null, merge_group: null },
	jobs: {
		quality: {
			name: "Quality",
			steps: [
				{ uses: "actions/checkout@v4" },
				{ run: "bun install --frozen-lockfile" },
				{ run: "bun run quality" },
			],
		},
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
		const job = {
			...workflow.jobs.quality,
			if: "github.actor != 'dependabot[bot]'",
			steps: [{ run: "bun install" }, { run: "bun run quality" }],
		};

		expect(
			checkQualityWorkflow({ ...workflow, jobs: { quality: job } }),
		).toEqual([
			"The quality job must not have an if condition: a skipped job does not block merging.",
			"The job must install with bun install --frozen-lockfile.",
		]);
	});

	it("rejects a workflow without the quality job", () => {
		expect(
			checkQualityWorkflow({ on: { pull_request: null }, jobs: {} }),
		).toEqual(["The workflow must define the quality job."]);
	});
});
