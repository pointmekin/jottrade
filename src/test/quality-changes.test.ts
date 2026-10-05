import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ChangeStatus,
	listChanges,
	parseNameStatus,
} from "../../scripts/quality/changes";
import { Check, planChecks, writePlan } from "../../scripts/quality/plan";

let repo: string;

const fixtureGit = [
	"-c",
	"commit.gpgsign=false",
	"-c",
	"core.hooksPath=/dev/null",
];

function git(...args: string[]) {
	// eslint-disable-next-line sonarjs/no-os-command-from-path -- test fixture: git comes from the developer's own PATH, like in quality.sh.
	execFileSync("git", [...fixtureGit, ...args], { cwd: repo, stdio: "pipe" });
}

function write(path: string, content = "export const value = 1;\n") {
	mkdirSync(dirname(join(repo, path)), { recursive: true });
	writeFileSync(join(repo, path), content);
}

function commit(message: string) {
	git("add", "-A");
	git("commit", "-q", "-m", message);
}

const plan = () => planChecks(listChanges("main", repo));

beforeEach(() => {
	repo = mkdtempSync(join(tmpdir(), "quality-changes-"));
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Fixture");
	git("config", "user.email", "fixture@example.com");
	write("package.json", "{}\n");
	write("biome.json", "{}\n");
	write("src/lib/old.ts");
	write("src/lib/kept.ts");
	write("src/routes/index.tsx");
	write("src/routeTree.gen.ts");
	commit("base");
	git("checkout", "-q", "-b", "feature");
});

afterEach(() => {
	rmSync(repo, { recursive: true, force: true });
});

describe("changed-file detection", () => {
	it("finds committed, staged, unstaged and untracked changes", () => {
		write("src/lib/committed.ts");
		commit("feature");
		write("src/lib/staged.ts");
		git("add", "src/lib/staged.ts");
		write("src/lib/kept.ts", "export const value = 2;\n");
		write("src/lib/untracked.ts");

		expect(plan().files.biome).toEqual([
			"src/lib/committed.ts",
			"src/lib/kept.ts",
			"src/lib/staged.ts",
			"src/lib/untracked.ts",
		]);
	});

	it("checks the new path of a rename and never the old one", () => {
		renameSync(join(repo, "src/lib/old.ts"), join(repo, "src/lib/new.ts"));
		commit("rename");

		const changes = listChanges("main", repo);
		expect(changes).toContainEqual({
			status: ChangeStatus.Deleted,
			path: "src/lib/old.ts",
		});
		expect(planChecks(changes).files.sonar).toEqual(["src/lib/new.ts"]);
	});

	it("keeps deletions out of the lint lists", () => {
		unlinkSync(join(repo, "src/lib/old.ts"));
		commit("delete");

		expect(plan().files.biome).toEqual([]);
	});

	it("keeps paths with spaces, quotes and non-ASCII characters intact", () => {
		const paths = [
			"src/components/journal/trade row.tsx",
			'src/lib/"quoted".ts',
			"src/lib/ราคา.ts",
		];
		for (const path of paths) write(path);
		commit("odd paths");
		write("src/lib/new file.ts");

		expect(plan().files.biome).toEqual(
			[...paths, "src/lib/new file.ts"].sort(),
		);
	});

	it("excludes the generated route tree but builds to check it", () => {
		write("src/routeTree.gen.ts", "export const routes = [];\n");
		commit("regenerate");

		const result = plan();
		expect(result.files.biome).toEqual([]);
		expect(result.checks[Check.Build]).toEqual(["src/routeTree.gen.ts"]);
	});

	it("respects .gitignore for untracked files", () => {
		write(".gitignore", "dist\n");
		write("dist/bundle.js");

		expect(plan().files.biome).toEqual([".gitignore"]);
	});
});

describe("focused checks", () => {
	it("runs tooling checks for config files outside src and scripts", () => {
		write("package.json", '{ "name": "fixture" }\n');
		write("biome.json", '{ "formatter": {} }\n');
		commit("config");

		const result = plan();
		expect(Object.keys(result.checks).sort()).toEqual(
			[
				Check.BiomeConfig,
				Check.Build,
				Check.EslintProject,
				Check.Lockfile,
			].sort(),
		);
	});

	it("runs tooling checks when a config file is deleted or renamed away", () => {
		renameSync(join(repo, "biome.json"), join(repo, "biome.jsonc"));
		commit("move biome config");

		expect(plan().checks[Check.BiomeConfig]).toEqual(["biome.json"]);
	});

	it("lints and builds for shared UI changes", () => {
		write("src/components/ui/button.tsx");

		const result = plan();
		expect(result.files.biome).toEqual(["src/components/ui/button.tsx"]);
		expect(result.files.sonar).toEqual(["src/components/ui/button.tsx"]);
		expect(result.checks[Check.Build]).toEqual([
			"src/components/ui/button.tsx",
		]);
	});

	it("builds when a route is added, but not when one is edited", () => {
		write("src/routes/index.tsx", "export const edited = true;\n");
		expect(plan().checks[Check.Build]).toBeUndefined();

		write("src/routes/new page.tsx");
		expect(plan().checks[Check.Build]).toEqual(["src/routes/new page.tsx"]);
	});

	it("runs every focused check when the gate itself changes", () => {
		write("scripts/quality/plan.ts");

		expect(Object.keys(plan().checks).sort()).toEqual(
			Object.values(Check).sort(),
		);
	});

	it("runs no focused check for a plain source change", () => {
		write("src/lib/kept.ts", "export const value = 3;\n");

		expect(plan().checks).toEqual({});
	});

	it("fails with a clear message when the base does not exist", () => {
		expect(() => listChanges("origin/missing", repo)).toThrow(
			/Cannot find a merge base between origin\/missing and HEAD/,
		);
	});
});

describe("plan output", () => {
	it("parses NUL-separated git output", () => {
		expect(parseNameStatus("M\0a b.ts\0D\0c.ts\0A\0d.ts\0T\0e.ts\0")).toEqual([
			{ status: ChangeStatus.Modified, path: "a b.ts" },
			{ status: ChangeStatus.Deleted, path: "c.ts" },
			{ status: ChangeStatus.Added, path: "d.ts" },
			{ status: ChangeStatus.Modified, path: "e.ts" },
		]);
	});

	it("writes NUL-terminated lists for xargs -0", () => {
		write("src/lib/two words.ts");
		write("package.json", '{ "name": "fixture" }\n');
		writePlan(repo, plan());

		const read = (list: string) => readFileSync(join(repo, list), "utf8");
		expect(read("sonar")).toBe("src/lib/two words.ts\0");
		expect(read("biome")).toBe("package.json\0src/lib/two words.ts\0");
		expect(read("shell")).toBe("");
		expect(read("checks").split("\n").filter(Boolean).sort()).toEqual(
			[Check.Build, Check.EslintProject, Check.Lockfile].sort(),
		);
	});
});
