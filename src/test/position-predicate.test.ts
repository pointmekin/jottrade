import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type SourceFile = { path: string; source: string };

const TRADE_READ = /\.from\(\s*trades\s*\)/g;
const GUARD =
	/positionRow|tradeConditions\(|(?:eq|inArray)\(trades\.(?:id|clientDraftId),/;
const DECLARATION = /\n(?:export |async |function |const )/g;

const ALLOWED_FILES: Record<string, string> = {
	"src/db/import-records.ts": "Import matching compares the leg rows.",
	"src/db/journal-archive.ts": "The archive exports every row.",
	"src/server/onboardingActions.ts": "Checks only that a trade exists.",
};

function readScope(source: string, index: number) {
	const start = Math.max(
		0,
		...[...source.slice(0, index).matchAll(DECLARATION)].map((m) => m.index),
	);
	const ends = [source.indexOf(".from(", index + 1), source.indexOf(";", index)]
		.filter((end) => end >= 0)
		.concat(source.length);
	return source.slice(start, Math.min(...ends));
}

/** Each list or statistics read of `trades` must skip legs with `positionRow`. */
function unguardedTradeReads(files: SourceFile[]) {
	return files
		.filter((file) => !(file.path in ALLOWED_FILES))
		.flatMap((file) =>
			[...file.source.matchAll(TRADE_READ)]
				.filter((match) => !GUARD.test(readScope(file.source, match.index)))
				.map(
					(match) =>
						`${file.path}:${file.source.slice(0, match.index).split("\n").length}`,
				),
		);
}

const readSources = (dir: string) =>
	readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name))
		.map((path) => ({ path, source: readFileSync(path, "utf8") }));

describe("position predicate", () => {
	it("guards each trade read in src/server and src/db", () => {
		const files = [...readSources("src/server"), ...readSources("src/db")];

		expect(files.map((file) => file.path)).toContain("src/server/getTrades.ts");
		expect(unguardedTradeReads(files)).toEqual([]);
	});

	it("accepts the predicate, the filter and a by-id read", () => {
		const file = {
			path: "src/db/fixture.ts",
			source: `
export const a = () => db.select().from(trades).where(and(positionRow, owned));
export async function b() {
	const where = tradeConditions(userId, filter);
	return db.select().from(trades).where(where);
}
export const c = () => db.select().from(trades).where(eq(trades.id, id));`,
		};

		expect(unguardedTradeReads([file])).toEqual([]);
	});

	it("rejects a new reader without the predicate", () => {
		const file = {
			path: "src/db/fixture.ts",
			source: `
export const byId = () => db.select().from(trades).where(eq(trades.id, id));
export const all = () =>
	db.select().from(trades).where(eq(trades.userId, userId));`,
		};

		expect(unguardedTradeReads([file])).toEqual(["src/db/fixture.ts:4"]);
	});
});
