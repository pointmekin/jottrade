import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	checkBoundaries,
	checkClientModule,
	checkServerModule,
} from "../../scripts/quality/server-boundaries";

const serverFn = (body: string) => ({
	path: "src/server/fixtureActions.ts",
	source: `import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth-middleware";
${body}`,
});
const client = (source: string) => ({
	path: "src/components/fixture.tsx",
	source,
});

describe("server boundaries in this repository", () => {
	it("has no violation", () => {
		const files = readdirSync("src", { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
			.map((entry) => join(entry.parentPath, entry.name))
			.map((path) => ({ path, source: readFileSync(path, "utf8") }));

		expect(files.map((file) => file.path)).toContain(
			"src/server/portfolioActions.ts",
		);
		expect(checkBoundaries(files)).toEqual([]);
	});
});

describe("server module rules", () => {
	it("accepts authenticated, validated server functions and a no-input read", () => {
		const file = serverFn(`
export type Row = { id: number };
export const getRows = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => context.userId);
export const saveRow = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.number() }))
	.handler(async ({ data }) => data.id);`);

		expect(checkServerModule(file)).toEqual([]);
	});

	it("rejects a server function without authMiddleware", () => {
		const file = serverFn(`
export const getRows = createServerFn({ method: "GET" }).handler(async () => 1);`);

		expect(checkServerModule(file)).toEqual([
			expect.stringContaining(
				"getRows: add .middleware([authMiddleware]) after createServerFn()",
			),
		]);
	});

	it("rejects a POST server function without a validator", () => {
		const file = serverFn(`
export const saveRow = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.handler(async () => 1);`);

		expect(checkServerModule(file)).toEqual([
			expect.stringContaining("saveRow: a POST server function must validate"),
		]);
	});

	it("rejects a helper export and a re-export", () => {
		const file = serverFn(`
import { db } from "@/db";
export async function loadRows() { return db; }
export const rowCount = 3;
export { db };`);

		expect(
			checkServerModule(file).map((problem) => problem.split(":")[1]),
		).toEqual(["6", "7", "8"]);
	});

	it("rejects a direct requireUserId call", () => {
		const file = serverFn(`
import { requireUserId } from "@/lib/auth";
export const getRows = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => requireUserId());`);

		expect(checkServerModule(file)).toEqual([
			expect.stringContaining(":5: do not call requireUserId"),
		]);
	});
	it("checks a server function that is not exported", () => {
		const file = serverFn(`
const hidden = createServerFn({ method: "GET" }).handler(async () => 1);`);

		expect(checkServerModule(file)).toEqual([
			expect.stringContaining("hidden: add .middleware([authMiddleware])"),
		]);
	});

	it("rejects a local stand-in named authMiddleware", () => {
		const file = {
			path: "src/server/fixtureActions.ts",
			source: `import { createMiddleware, createServerFn } from "@tanstack/react-start";
const authMiddleware = createMiddleware({ type: "function" }).server(({ next }) => next());
export const getRows = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => 1);`,
		};

		expect(checkServerModule(file)).toEqual([
			expect.stringContaining("getRows: add .middleware([authMiddleware])"),
		]);
	});

	it("rejects an aliased requireUserId import and an exported enum", () => {
		const file = serverFn(`
import { requireUserId as currentUser } from "../lib/auth";
export enum Mode { A }`);

		expect(checkServerModule(file)).toEqual([
			expect.stringContaining(":6: a server module may export only"),
			expect.stringContaining(":5: do not call requireUserId"),
		]);
	});

	it("still checks server functions in an export exception file", () => {
		const file = {
			path: "src/server/rangeInput.ts",
			source: `import { createServerFn } from "@tanstack/react-start";
export const sneaky = createServerFn().handler(async () => 1);`,
		};

		expect(checkServerModule(file)).toEqual([
			expect.stringContaining("sneaky: add .middleware([authMiddleware])"),
		]);
	});
});

describe("server functions outside src/server", () => {
	it("checks a server function in a route file", () => {
		const route = {
			path: "src/routes/_authenticated/fixture.tsx",
			source: `import { createServerFn } from "@tanstack/react-start";
const load = createServerFn().handler(async () => 1);`,
		};

		expect(checkBoundaries([route])).toEqual([
			expect.stringContaining("load: add .middleware([authMiddleware])"),
		]);
	});
});

describe("client module rule", () => {
	it("accepts server-function proxies, type-only imports and client packages", () => {
		const file = client(`
import type { ReviewImportChange } from "@/db/review-import-history";
import { type AccountRow } from "@/db/portfolios";
import { createAuthClient } from "better-auth/react";
import { getAccounts } from "@/server/portfolioActions";`);

		expect(checkClientModule(file)).toEqual([]);
	});

	it("rejects database, auth, driver and dynamic imports", () => {
		const file = client(`
import { db } from "@/db";
import { trades } from "../db/schema";
import { auth } from "@/lib/auth";
import { Pool } from "pg/lib/index.js";
export { neon } from "@neondatabase/serverless";
const later = () => import("@/lib/gcp");`);

		expect(
			checkClientModule(file).map((problem) => problem.split(":")[1]),
		).toEqual(["2", "3", "4", "5", "6", "7"]);
	});

	it("does not apply to server-only folders", () => {
		expect(
			checkBoundaries([
				{ path: "src/db/fixture.ts", source: 'import { Pool } from "pg";' },
				{ path: "src/test/fixture.ts", source: 'import { db } from "@/db";' },
			]),
		).toEqual([]);
	});
});
