import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RiskRuleKind, RuleOutcome } from "@/lib/risk-rule-evaluation";
import { DailyLossUnit } from "@/lib/risk-rules";
import { TradeSide } from "@/lib/trade";
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
const ALICE_MAIN = 1;
const ALICE_PROP = 2;
const ALICE_EUR = 3;
const BOB_ACCOUNT = 4;
const BOB_NO_TIMEZONE = 5;
const RULES = { maxTradesPerDay: 3 };
const SYMBOL = "RULECHECK";
const DRAFT_ID = "0b7e3f52-4c1d-4e8a-9f3b-6a2d1c5e7f90";

describe.skipIf(!verifyUrl)("risk rules on the seeded database", () => {
	let server: typeof import("@/server/riskRuleActions");
	let accounts: typeof import("@/server/portfolioActions");
	let tradeActions: typeof import("@/server/tradeActions");
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
		tradeActions = await import("@/server/tradeActions");
	});

	afterAll(async () => {
		if (!db) return;
		await db.delete(schema.trades).where(orm.eq(schema.trades.symbol, SYMBOL));
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

	it("treats an equal decimal in another form as no change", async () => {
		session.userId = ALICE;
		const save = (value: string) =>
			server.saveRiskRules({
				data: { portfolioId: ALICE_EUR, rules: { maxTradeRiskAmount: value } },
			});

		expect(await save("500")).toEqual({ saved: true });
		expect(await save("500.00")).toEqual({ saved: false });
		expect(await save("0500.0")).toEqual({ saved: false });
		expect(await versionsOf(ALICE_EUR)).toHaveLength(1);
	});

	it("does not write a clear when the account has no rules", async () => {
		session.userId = ALICE;

		expect(
			await server.clearRiskRules({ data: { portfolioId: ALICE_MAIN } }),
		).toEqual({ saved: false });
		expect(await versionsOf(ALICE_MAIN)).toEqual([]);
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

	it("returns the version in effect and the day of the entry, only to the owner", async () => {
		session.userId = ALICE;
		await server.saveRiskRules({
			data: { portfolioId: ALICE_PROP, rules: RULES },
		});
		const entryDate = new Date(Date.now() + 60_000).toISOString();
		const data = { portfolioId: ALICE_PROP, entryDate };

		const context = await server.getRuleContext({ data });
		const before = await server.getRuleContext({
			data: { ...data, entryDate: "2020-01-01T00:00:00.000Z" },
		});

		expect(context).toMatchObject({
			version: { rules: { v: 1, ...RULES }, timezone: "UTC" },
			dayKey: entryDate.slice(0, 10),
		});
		expect(before.version).toBeNull();
		session.userId = BOB;
		await expect(server.getRuleContext({ data })).rejects.toThrow(
			"Account not found.",
		);
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

	const logTrade = (portfolioId: number, entryDate: string) =>
		tradeActions.createTrade({
			data: {
				portfolioId,
				entryDate,
				symbol: SYMBOL,
				side: TradeSide.Long,
				entryPrice: "100",
				quantity: "1",
			},
		});
	const storedCheck = async (id: number) => {
		const [row] = await db
			.select({ ruleCheck: schema.trades.ruleCheck })
			.from(schema.trades)
			.where(orm.eq(schema.trades.id, id));
		return row.ruleCheck;
	};
	const countOf = (check: Awaited<ReturnType<typeof storedCheck>>) =>
		check?.outcomes.find((item) => item.kind === RiskRuleKind.DailyTradeCount);

	it("checks a trade only with the rules and day facts of its own account", async () => {
		session.userId = ALICE;
		await server.saveRiskRules({
			data: { portfolioId: ALICE_PROP, rules: RULES },
		});
		const entryDate = new Date(Date.now() + 60_000).toISOString();
		session.userId = BOB;
		const bob = await logTrade(BOB_ACCOUNT, entryDate);
		await expect(logTrade(ALICE_PROP, entryDate)).rejects.toThrow(
			"Account not found.",
		);
		session.userId = ALICE;
		const { enteredCount } = await server.getRuleContext({
			data: { portfolioId: ALICE_PROP, entryDate },
		});
		const main = await logTrade(ALICE_MAIN, entryDate);
		const prop = await logTrade(ALICE_PROP, entryDate);

		expect(bob.ruleCheck).toBeNull();
		expect(await storedCheck(bob.id)).toBeNull();
		expect(await storedCheck(main.id)).toBeNull();
		const stored = await storedCheck(prop.id);
		expect(stored).toEqual(prop.ruleCheck);
		expect(stored).toMatchObject({ v: 1, timezone: "UTC" });
		expect(countOf(stored)).toMatchObject({
			limit: 3,
			actual: enteredCount + 1,
		});
	});

	it("makes one trade with one check for a retry with the same draft id", async () => {
		session.userId = ALICE;
		const data = {
			portfolioId: ALICE_PROP,
			entryDate: new Date(Date.now() + 60_000).toISOString(),
			symbol: SYMBOL,
			side: TradeSide.Long,
			entryPrice: "100",
			quantity: "1",
			clientDraftId: DRAFT_ID,
		};

		const first = await tradeActions.createTrade({ data });
		const retry = await tradeActions.createTrade({ data });

		expect(retry).toMatchObject({ id: first.id, duplicate: true });
		expect(retry.ruleCheck).toEqual(first.ruleCheck);
		expect(await storedCheck(first.id)).toEqual(first.ruleCheck);
		const rows = await db
			.select({ id: schema.trades.id })
			.from(schema.trades)
			.where(orm.eq(schema.trades.clientDraftId, DRAFT_ID));
		expect(rows).toHaveLength(1);
		expect(countOf(first.ruleCheck)?.outcome).not.toBe(RuleOutcome.NotSet);
	});
});
