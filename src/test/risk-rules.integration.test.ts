import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DailyLossUnit } from "@/lib/risk-rules";
import { checkTarget } from "../../scripts/db/target";

// Runs in `npm run verify` on the seeded database, as user-isolation.integration.test.ts.
const verifyUrl = process.env.VERIFY_DATABASE_URL;

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
	requireUserId: async () => {
		if (!session.userId) throw new Error("Unauthorized");
		return session.userId;
	},
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));

// Seed facts from scripts/db/seed-accounts.ts.
const ALICE = "seed-alice";
const BOB = "seed-bob";
const ALICE_PROP = 2;
const ALICE_EUR = 3;
const BOB_NO_TIMEZONE = 5;
const RULES = { maxTradesPerDay: 3 };

describe.skipIf(!verifyUrl)("risk rules on the seeded database", () => {
	let server: typeof import("@/server/riskRuleActions");
	let accounts: typeof import("@/server/portfolioActions");
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");

	const versionsOf = (portfolioId: number) =>
		db
			.select()
			.from(schema.riskRuleVersions)
			.where(orm.eq(schema.riskRuleVersions.portfolioId, portfolioId))
			.orderBy(schema.riskRuleVersions.version);

	beforeAll(async () => {
		const target = checkTarget({ ...process.env, DATABASE_URL: verifyUrl });
		if (!target.ok || !target.database.startsWith("jottrade_test_")) {
			throw new Error(
				"Isolation tests need a disposable jottrade_test_* database.",
			);
		}
		if (process.env.DATABASE_URL !== verifyUrl) {
			throw new Error("DATABASE_URL must equal VERIFY_DATABASE_URL.");
		}
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		orm = await import("drizzle-orm");
		server = await import("@/server/riskRuleActions");
		accounts = await import("@/server/portfolioActions");
	});

	afterAll(async () => {
		if (!db) return;
		await db
			.delete(schema.riskRuleVersions)
			.where(orm.eq(schema.riskRuleVersions.userId, ALICE));
	});

	it("keeps each version and writes nothing for a save with no change", async () => {
		session.userId = ALICE;
		const first = { portfolioId: ALICE_PROP, rules: RULES };

		expect(await server.saveRiskRules({ data: first })).toEqual({
			saved: true,
		});
		const [v1] = await versionsOf(ALICE_PROP);
		expect(await server.saveRiskRules({ data: first })).toEqual({
			saved: false,
		});
		await server.saveRiskRules({
			data: {
				portfolioId: ALICE_PROP,
				rules: {
					dailyLoss: { unit: DailyLossUnit.BalancePercent, value: "2" },
				},
			},
		});
		await server.clearRiskRules({ data: { portfolioId: ALICE_PROP } });

		const rows = await versionsOf(ALICE_PROP);
		expect(rows.map((row) => row.version)).toEqual([1, 2, 3]);
		expect(rows[0]).toEqual(v1);
		expect(v1).toMatchObject({
			userId: ALICE,
			rules: { v: 1, ...RULES },
			timezone: "UTC",
		});
		expect(rows[2].rules).toEqual({ v: 1 });
		const { current } = await server.getRiskRules({
			data: { portfolioId: ALICE_PROP },
		});
		expect(current).toMatchObject({ version: 3, rules: { v: 1 } });
	});

	it("does not write a clear when the account has no rules", async () => {
		session.userId = ALICE;

		expect(
			await server.clearRiskRules({ data: { portfolioId: ALICE_EUR } }),
		).toEqual({ saved: false });
		expect(await versionsOf(ALICE_EUR)).toEqual([]);
	});

	it("rejects a save when the account has no review timezone", async () => {
		session.userId = BOB;

		await expect(
			server.saveRiskRules({
				data: { portfolioId: BOB_NO_TIMEZONE, rules: RULES },
			}),
		).rejects.toThrow("Choose your review timezone first.");
		expect(await versionsOf(BOB_NO_TIMEZONE)).toEqual([]);
	});

	it("does not let another user read, save or clear rules", async () => {
		session.userId = BOB;
		const before = await versionsOf(ALICE_PROP);
		const data = { portfolioId: ALICE_PROP };

		for (const call of [
			() => server.getRiskRules({ data }),
			() =>
				server.saveRiskRules({
					data: { ...data, rules: { maxTradesPerDay: 1 } },
				}),
			() => server.clearRiskRules({ data }),
		])
			await expect(call()).rejects.toThrow("Account not found.");
		expect(await versionsOf(ALICE_PROP)).toEqual(before);
	});

	it("deletes the versions with the account", async () => {
		session.userId = ALICE;
		const [account] = await db
			.insert(schema.portfolios)
			.values({ userId: ALICE, name: "Rules fixture", reviewTimezone: "UTC" })
			.returning({ id: schema.portfolios.id });
		await server.saveRiskRules({
			data: { portfolioId: account.id, rules: RULES },
		});
		expect(await versionsOf(account.id)).toHaveLength(1);

		await accounts.deleteAccount({
			data: { id: account.id, confirmName: "Rules fixture" },
		});

		expect(await versionsOf(account.id)).toEqual([]);
	});
});
