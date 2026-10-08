import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	checkMigrations,
	type MigrationFiles,
} from "../../scripts/quality/migrations";

const ROOT_ID = "00000000-0000-0000-0000-000000000000";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

const goodFixture = (): MigrationFiles => ({
	journal: {
		entries: [
			{ idx: 0, tag: "0000_first" },
			{ idx: 1, tag: "0001_second" },
		],
	},
	sqlFiles: ["0000_first.sql", "0001_second.sql"],
	snapshots: {
		"0000_snapshot.json": { id: "a", prevId: ROOT_ID },
		"0001_snapshot.json": { id: "b", prevId: "a" },
	},
});

describe("drizzle migrations in this repository", () => {
	it("have a contiguous journal, matching SQL files and one snapshot chain", () => {
		const metaFiles = readdirSync("drizzle/meta").filter((name) =>
			name.endsWith("_snapshot.json"),
		);
		const files: MigrationFiles = {
			journal: readJson("drizzle/meta/_journal.json"),
			sqlFiles: readdirSync("drizzle").filter((name) => name.endsWith(".sql")),
			snapshots: Object.fromEntries(
				metaFiles.map((name) => [name, readJson(`drizzle/meta/${name}`)]),
			),
		};

		expect(files.journal.entries.length).toBeGreaterThan(0);
		expect(checkMigrations(files)).toEqual([]);
	});
});

describe("migration checks", () => {
	it("accepts a good fixture", () => {
		expect(checkMigrations(goodFixture())).toEqual([]);
	});

	it("rejects two branches that add the same index", () => {
		const files = goodFixture();
		files.journal.entries.push({ idx: 1, tag: "0001_other" });
		files.sqlFiles.push("0001_other.sql");
		files.snapshots["0001_other_snapshot.json"] = { id: "c", prevId: "a" };

		expect(checkMigrations(files)).toEqual([
			expect.stringContaining("journal entry 2 (idx 1, 0001_other)"),
			expect.stringContaining("0001_snapshot.json: prevId a does not follow c"),
		]);
	});

	it("rejects a journal that does not start at 0 or has a gap", () => {
		const files = goodFixture();
		files.journal.entries[1] = { idx: 2, tag: "0002_second" };
		files.sqlFiles[1] = "0002_second.sql";

		expect(checkMigrations(files)).toEqual([
			expect.stringContaining("expected idx 1 and a 0001_ tag"),
		]);
	});

	it("rejects a journal tag without SQL and SQL without a journal tag", () => {
		const files = goodFixture();
		files.sqlFiles = ["0000_first.sql", "0001_renamed.sql"];

		expect(checkMigrations(files)).toEqual([
			expect.stringContaining("drizzle/0001_second.sql is missing"),
			expect.stringContaining("drizzle/0001_renamed.sql is not in"),
		]);
	});

	it("rejects a broken snapshot chain", () => {
		const files = goodFixture();
		files.snapshots["0001_snapshot.json"].prevId = "x";

		expect(checkMigrations(files)).toEqual([
			expect.stringContaining("0001_snapshot.json: prevId x does not follow a"),
		]);
	});
});
