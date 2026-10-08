import { verifyPassword } from "better-auth/crypto";
import { describe, expect, it, vi } from "vitest";
import { databaseDriver } from "@/db";
import { localUrl, worktreeDatabaseName } from "../../scripts/db/local";
import {
	buildSeedData,
	SEED_PASSWORD,
	SeedUser,
} from "../../scripts/db/seed-data";
import { checkTarget, redact } from "../../scripts/db/target";

vi.hoisted(() => {
	process.env.DATABASE_URL ??= "postgresql://u:p@127.0.0.1:1/jottrade_test";
});
vi.mock("@neondatabase/serverless", () => ({ neon: () => vi.fn() }));

const local = "postgresql://u:secret@127.0.0.1:54329/jottrade_dev_main";

describe("checkTarget", () => {
	it("accepts a local development or test database", () => {
		expect(checkTarget({ DATABASE_URL: local })).toMatchObject({
			ok: true,
			database: "jottrade_dev_main",
		});
		for (const host of ["localhost", "[::1]"])
			expect(
				checkTarget({
					DATABASE_URL: `postgres://u@${host}/jottrade_test_run_1`,
				}).ok,
			).toBe(true);
		expect(
			checkTarget({
				DATABASE_URL: "postgresql:///jottrade_test?host=/var/run/postgresql",
			}).ok,
		).toBe(true);
	});

	it.each([
		["missing", undefined, /not set/],
		["not a URL", "jottrade_dev", /postgres:\/\//],
		["mysql", "mysql://u@127.0.0.1/jottrade_dev", /postgres:\/\//],
		["production name", "postgresql://u@127.0.0.1/neondb", /explicit/],
		["bare app name", "postgresql://u@127.0.0.1/jottrade", /explicit/],
		[
			"prefix only",
			"postgresql://u@127.0.0.1/jottrade_development",
			/explicit/,
		],
		["upper case", "postgresql://u@127.0.0.1/jottrade_dev_X", /explicit/],
		[
			"neon host",
			"postgresql://u:p@ep-x-1.us-east-2.aws.neon.tech/jottrade_dev_a?sslmode=require",
			/not local/,
		],
		[
			"remote socket",
			"postgresql:///jottrade_dev?host=db.internal",
			/not local/,
		],
	])("refuses %s", (_case, url, reason) => {
		const check = checkTarget({ DATABASE_URL: url });
		expect(check.ok).toBe(false);
		if (!check.ok) expect(check.reason).toMatch(reason);
	});

	it("refuses a name longer than Postgres keeps", () => {
		const name = `jottrade_dev_${"a".repeat(60)}`;
		expect(
			checkTarget({ DATABASE_URL: `postgres://u@localhost/${name}` }).ok,
		).toBe(false);
	});

	it("refuses anything while NODE_ENV is production", () => {
		expect(
			checkTarget({ DATABASE_URL: local, NODE_ENV: "production" }).ok,
		).toBe(false);
	});

	it("allows a remote host only when that exact host is opted in", () => {
		const url = "postgresql://u:p@ep-dev.neon.tech/jottrade_dev_branch";
		expect(
			checkTarget({
				DATABASE_URL: url,
				JOTTRADE_DB_ALLOW_REMOTE_HOST: "neon.tech",
			}).ok,
		).toBe(false);
		expect(
			checkTarget({
				DATABASE_URL: url,
				JOTTRADE_DB_ALLOW_REMOTE_HOST: "ep-dev.neon.tech",
			}).ok,
		).toBe(true);
		expect(
			checkTarget({
				DATABASE_URL: "postgresql://u:p@ep-dev.neon.tech/neondb",
				JOTTRADE_DB_ALLOW_REMOTE_HOST: "ep-dev.neon.tech",
			}).ok,
		).toBe(false);
	});

	it("hides the password in logs", () => {
		expect(redact(new URL(local))).not.toContain("secret");
	});
});

describe("worktreeDatabaseName", () => {
	it("gives a valid, stable, path-specific name", () => {
		const name = worktreeDatabaseName(".");
		expect(name).toMatch(/^jottrade_dev_[a-z0-9_]+_[0-9a-f]{8}$/);
		expect(worktreeDatabaseName(".")).toBe(name);
		expect(worktreeDatabaseName("src")).not.toBe(name);
		expect(checkTarget({ DATABASE_URL: localUrl(name) }).ok).toBe(true);
	});

	it("refuses to build a local URL for an unsafe name", () => {
		expect(() => localUrl("neondb")).toThrow();
	});
});

describe("buildSeedData", () => {
	it("is identical on every run", () => {
		expect(buildSeedData()).toEqual(buildSeedData());
	});

	it("covers several users, accounts and the empty cases", () => {
		const data = buildSeedData();
		const accounts = (id: string) =>
			data.portfolios.filter((p) => p.userId === id);
		expect(accounts(SeedUser.Alice)).toHaveLength(3);
		expect(accounts(SeedUser.Bob)).toHaveLength(2);
		expect(accounts(SeedUser.Nora)).toHaveLength(0);
		const erin = accounts(SeedUser.Erin).map((p) => p.id);
		expect(data.trades.some((t) => erin.includes(t.portfolioId))).toBe(false);
		expect(data.trades.some((t) => t.exitDate === null)).toBe(true);
		expect(data.trades.some((t) => t.netPnl === "0.00")).toBe(true);
		expect(data.cashFlows.some((c) => Number(c.amount) < 0)).toBe(true);
	});

	it("keeps every trade owned by its account's user", () => {
		const data = buildSeedData();
		const owner = new Map(data.portfolios.map((p) => [p.id, p.userId]));
		for (const row of [...data.trades, ...data.cashFlows])
			expect(owner.get(row.portfolioId)).toBe(row.userId);
	});

	it("links only a user's own tags to that user's trades", () => {
		const data = buildSeedData();
		const tradeOwner = new Map(data.trades.map((t) => [t.id, t.userId]));
		const tagOwner = new Map(data.tags.map((t) => [t.id, t.userId]));
		expect(data.tradeTags.length).toBeGreaterThan(0);
		for (const link of data.tradeTags) {
			expect(tradeOwner.get(link.tradeId)).toBe(SeedUser.Alice);
			expect(tagOwner.get(link.tagId)).toBe(SeedUser.Alice);
		}
	});

	it("stores passwords that Better Auth accepts", async () => {
		const [credential] = buildSeedData().credentials;
		const hash = credential.password ?? "";
		await expect(
			verifyPassword({ hash, password: SEED_PASSWORD }),
		).resolves.toBe(true);
		await expect(verifyPassword({ hash, password: "wrong" })).resolves.toBe(
			false,
		);
	});
});

describe("databaseDriver", () => {
	it("defaults to Neon and accepts pg", () => {
		expect(databaseDriver("")).toBe("neon");
		expect(databaseDriver("pg")).toBe("pg");
	});

	it("rejects an unknown driver", () => {
		expect(() => databaseDriver("mysql")).toThrow(/DATABASE_DRIVER/);
	});
});
