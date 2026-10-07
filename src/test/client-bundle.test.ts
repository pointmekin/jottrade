import { describe, expect, it } from "vitest";
import {
	findClientLeaks,
	missingServerMarkers,
	SERVER_ONLY_MARKERS,
} from "../../scripts/verify/client-bundle";

const clean = { path: "assets/main.js", content: "const a=1;fetch('/api')" };

describe("client bundle check", () => {
	it("passes a client bundle without server-only content", () => {
		expect(findClientLeaks([clean], {})).toEqual([]);
	});

	it("reports a server-only variable name, a secret value and a server module", () => {
		const files = [
			{ path: "a.js", content: "process.env.DATABASE_URL" },
			{ path: "b.js", content: 'const s="sentinel-auth-secret"' },
			{ path: "c.js", content: 'throw new NeonDbError("x")' },
			{ path: "d.js", content: '"postgresql://user:pw@host/db"' },
		];

		expect(
			findClientLeaks(files, { BETTER_AUTH_SECRET: "sentinel-auth-secret" }),
		).toEqual([
			"a.js: names the server-only variable DATABASE_URL",
			"b.js: contains the value of BETTER_AUTH_SECRET",
			'c.js: contains "NeonDbError" from @neondatabase/serverless',
			"d.js: contains a PostgreSQL connection string with credentials",
		]);
	});

	it("ignores short secret values that could match by chance", () => {
		const files = [{ path: "a.js", content: "const x='abc'" }];

		expect(findClientLeaks(files, { GEMINI_API_KEY: "abc" })).toEqual([]);
	});

	it("reports markers that the server output does not contain", () => {
		const server = [
			{ path: "index.mjs", content: Object.keys(SERVER_ONLY_MARKERS).join() },
		];

		expect(missingServerMarkers(server)).toEqual([]);
		expect(missingServerMarkers([clean])).toEqual(
			Object.keys(SERVER_ONLY_MARKERS),
		);
	});
});
