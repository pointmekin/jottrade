import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AccountKind } from "@/lib/account";
import { AccountEntryKind } from "@/lib/account-entry";
import { PeriodPreset } from "@/lib/period";
import { PlaybookCriterionKind } from "@/lib/playbook";
import { TradeSide } from "@/lib/trade";
import { checkTarget } from "../../scripts/db/target";

// `npm run verify` sets VERIFY_DATABASE_URL to a fresh, seeded jottrade_test_*
// database and DATABASE_URL to the same value. The real `@/db` client runs
// the queries; only the session lookup and the server-function wrapper are
// replaced, so each handler runs its own ownership checks against PostgreSQL.
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
const ALICE_ACCOUNT = 1;
const BOB_ACCOUNT = 4;
const ALICE_STRATEGY = 1;
const NORA = "seed-nora";
const NOT_FOUND = "Saved view not found.";
const CRITERION = {
	id: "c1",
	kind: PlaybookCriterionKind.Entry,
	text: "Close above the range",
	required: true,
};
const DUPLICATE = "A view with this name already exists.";

describe.skipIf(!verifyUrl)("user isolation on the seeded database", () => {
	let server: {
		trades: typeof import("@/server/tradeActions");
		reads: typeof import("@/server/getTrades");
		accounts: typeof import("@/server/portfolioActions");
		cashFlows: typeof import("@/server/cashFlowActions");
		strategies: typeof import("@/server/strategyActions");
		views: typeof import("@/server/savedViewActions");
		checks: typeof import("@/server/playbookCheckActions");
	};
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let aliceTradeId: number;
	let aliceCashFlowId: number;
	let snapshot: () => Promise<unknown>;

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
		server = {
			trades: await import("@/server/tradeActions"),
			reads: await import("@/server/getTrades"),
			accounts: await import("@/server/portfolioActions"),
			cashFlows: await import("@/server/cashFlowActions"),
			strategies: await import("@/server/strategyActions"),
			views: await import("@/server/savedViewActions"),
			checks: await import("@/server/playbookCheckActions"),
		};
		const { eq, or } = await import("drizzle-orm");
		const [trade] = await db
			.select()
			.from(schema.trades)
			.where(eq(schema.trades.portfolioId, ALICE_ACCOUNT))
			.limit(1);
		const [cashFlow] = await db
			.select()
			.from(schema.cashFlows)
			.where(eq(schema.cashFlows.portfolioId, ALICE_ACCOUNT))
			.limit(1);
		aliceTradeId = trade.id;
		aliceCashFlowId = cashFlow.id;
		snapshot = async () => ({
			trades: await db
				.select()
				.from(schema.trades)
				.where(
					or(
						eq(schema.trades.userId, ALICE),
						eq(schema.trades.portfolioId, ALICE_ACCOUNT),
					),
				),
			accounts: await db
				.select()
				.from(schema.portfolios)
				.where(eq(schema.portfolios.userId, ALICE)),
			cashFlows: await db
				.select()
				.from(schema.cashFlows)
				.where(
					or(
						eq(schema.cashFlows.userId, ALICE),
						eq(schema.cashFlows.portfolioId, ALICE_ACCOUNT),
					),
				),
			strategies: await db
				.select()
				.from(schema.strategies)
				.where(eq(schema.strategies.userId, ALICE)),
		});
	});

	afterAll(() => {
		session.userId = "";
	});

	it("lets the owner read their own trade, as a control", async () => {
		session.userId = ALICE;
		const trade = await server.reads.getTradeById({
			data: { portfolioId: ALICE_ACCOUNT, id: aliceTradeId },
		});
		expect(trade?.id).toBe(aliceTradeId);
	});

	it("returns nothing of another user's trades, accounts, cash flows or strategies", async () => {
		session.userId = BOB;
		const trade = await server.reads.getTradeById({
			data: { portfolioId: ALICE_ACCOUNT, id: aliceTradeId },
		});
		const list = await server.reads.getTrades({
			data: { portfolioId: ALICE_ACCOUNT, page: 1 },
		});
		const accounts = await server.accounts.getAccounts();
		const cashFlows = await server.cashFlows.getCashFlows({
			data: { portfolioId: ALICE_ACCOUNT },
		});
		const strategies = await server.strategies.getStrategies();

		expect(trade).toBeNull();
		expect(list.trades).toEqual([]);
		expect(accounts.map((account) => account.id)).toContain(BOB_ACCOUNT);
		expect(accounts.map((account) => account.id)).not.toContain(ALICE_ACCOUNT);
		expect(cashFlows).toEqual([]);
		expect(strategies.map((strategy) => strategy.userId)).toEqual([BOB]);
	});

	it("rejects every write to another user's data and leaves it unchanged", async () => {
		const before = await snapshot();
		session.userId = BOB;
		const { trades, accounts, cashFlows, strategies, checks } = server;
		const check = { expectedRevision: 0, criteriaVersion: 1, results: {} };
		// Each handler reports its own ownership check, not an unrelated error.
		const writes: [Promise<unknown>, string][] = [
			[
				trades.createTrade({
					data: {
						portfolioId: ALICE_ACCOUNT,
						symbol: "INTRUDER",
						side: TradeSide.Long,
						entryDate: "2026-09-01T08:00:00Z",
						entryPrice: "100",
						quantity: "1",
					},
				}),
				"Account not found.",
			],
			[
				trades.updateTrade({ data: { id: aliceTradeId, exitPrice: "1" } }),
				"Trade not found",
			],
			[
				trades.deleteTrade({ data: { id: aliceTradeId } }),
				"Trade was removed or belongs to a persisted review.",
			],
			[
				accounts.updateAccount({
					data: {
						id: ALICE_ACCOUNT,
						name: "Taken",
						description: "",
						kind: AccountKind.Real,
						currency: "USD",
					},
				}),
				"Account not found.",
			],
			[
				accounts.deleteAccount({
					data: { id: ALICE_ACCOUNT, confirmName: "Main USD" },
				}),
				"Account not found.",
			],
			[
				cashFlows.addCashFlow({
					data: {
						portfolioId: ALICE_ACCOUNT,
						occurredAt: "2026-09-01T08:00:00Z",
						amount: 1,
						kind: AccountEntryKind.Deposit,
					},
				}),
				"Account not found.",
			],
			[
				cashFlows.deleteCashFlow({ data: { id: aliceCashFlowId } }),
				"Cash flow not found.",
			],
			[
				strategies.updateStrategy({
					data: { id: ALICE_STRATEGY, name: "Taken", criteria: [CRITERION] },
				}),
				"Strategy not found",
			],
			[
				strategies.deleteStrategy({ data: { id: ALICE_STRATEGY } }),
				"Strategy not found",
			],
			[
				checks.savePlaybookCheck({
					data: { portfolioId: ALICE_ACCOUNT, id: aliceTradeId, ...check },
				}),
				"Account not found.",
			],
			[
				checks.savePlaybookCheck({
					data: { portfolioId: BOB_ACCOUNT, id: aliceTradeId, ...check },
				}),
				"Trade not found.",
			],
		];

		const results = await Promise.allSettled(writes.map(([write]) => write));

		expect(
			results.map((result) =>
				result.status === "rejected" ? result.reason.message : "fulfilled",
			),
		).toEqual(writes.map(([, message]) => message));
		expect(await snapshot()).toEqual(before);
	});

	it("hides another user's playbook check and criteria", async () => {
		session.userId = BOB;
		const { eq } = await import("drizzle-orm");
		const { getPlaybookCheck } = server.checks;
		await expect(
			getPlaybookCheck({
				data: { portfolioId: ALICE_ACCOUNT, id: aliceTradeId },
			}),
		).rejects.toThrow("Account not found.");
		await expect(
			getPlaybookCheck({
				data: { portfolioId: BOB_ACCOUNT, id: aliceTradeId },
			}),
		).rejects.toThrow("Trade not found.");
		// Old data can hold a foreign setup_id; the read joins on the owner.
		const [bobTrade] = await db
			.select()
			.from(schema.trades)
			.where(eq(schema.trades.portfolioId, BOB_ACCOUNT))
			.limit(1);
		const setSetup = (setupId: number | null) =>
			db
				.update(schema.trades)
				.set({ setupId })
				.where(eq(schema.trades.id, bobTrade.id));
		await setSetup(ALICE_STRATEGY);
		try {
			const read = await getPlaybookCheck({
				data: { portfolioId: BOB_ACCOUNT, id: bobTrade.id },
			});
			expect(read.strategy).toBeNull();
		} finally {
			await setSetup(bobTrade.setupId);
		}
	});

	it("rejects a move of the user's own trade into another user's account", async () => {
		session.userId = BOB;
		const { eq } = await import("drizzle-orm");
		const [bobTrade] = await db
			.select()
			.from(schema.trades)
			.where(eq(schema.trades.portfolioId, BOB_ACCOUNT))
			.limit(1);

		await expect(
			server.trades.updateTrade({
				data: { id: bobTrade.id, portfolioId: ALICE_ACCOUNT },
			}),
		).rejects.toThrow("Account not found.");
		const [after] = await db
			.select()
			.from(schema.trades)
			.where(eq(schema.trades.id, bobTrade.id));
		expect(after).toEqual(bobTrade);
	});

	it("rejects reads and writes without a session before the handler runs", async () => {
		const before = await snapshot();
		session.userId = "";
		const { trades, reads, accounts, strategies } = server;
		const calls = [
			reads.getTrades({ data: { portfolioId: ALICE_ACCOUNT, page: 1 } }),
			reads.getTradeById({
				data: { portfolioId: ALICE_ACCOUNT, id: aliceTradeId },
			}),
			accounts.getAccounts(),
			strategies.getStrategies(),
			accounts.ensureDefaultAccount(),
			trades.deleteTrade({ data: { id: aliceTradeId } }),
			// Invalid input: the session check still comes first.
			trades.createTrade({ data: { portfolioId: -1 } as never }),
		];

		const results = await Promise.allSettled(calls);

		expect(
			results.map((result) =>
				result.status === "rejected" ? result.reason.message : "fulfilled",
			),
		).toEqual(calls.map(() => "Unauthorized"));
		expect(await snapshot()).toEqual(before);
	});

	it("reads accounts without a write, then provisions one default under concurrent calls", async () => {
		const { eq } = await import("drizzle-orm");
		const noraAccounts = () =>
			db
				.select()
				.from(schema.portfolios)
				.where(eq(schema.portfolios.userId, NORA));
		session.userId = NORA;

		expect(await server.accounts.getAccounts()).toEqual([]);
		expect(await noraAccounts()).toEqual([]);

		const results = await Promise.all(
			Array.from({ length: 5 }, () => server.accounts.ensureDefaultAccount()),
		);

		const rows = await noraAccounts();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: "Main account", isDefault: true });
		for (const accounts of results) {
			expect(accounts.map((account) => account.id)).toEqual([rows[0].id]);
		}
	});

	it("repairs a missing default once, on the oldest account, under concurrent calls", async () => {
		const { eq } = await import("drizzle-orm");
		session.userId = NORA;
		await server.accounts.createAccount({
			data: {
				name: "Second",
				description: "",
				kind: AccountKind.Real,
				currency: "USD",
			},
		});
		await db
			.update(schema.portfolios)
			.set({ isDefault: false })
			.where(eq(schema.portfolios.userId, NORA));

		await Promise.all(
			Array.from({ length: 5 }, () => server.accounts.ensureDefaultAccount()),
		);

		const rows = await db
			.select()
			.from(schema.portfolios)
			.where(eq(schema.portfolios.userId, NORA))
			.orderBy(schema.portfolios.id);
		expect(rows.map((row) => [row.name, row.isDefault])).toEqual([
			["Main account", true],
			["Second", false],
		]);
	});

	describe("saved views", () => {
		const SCOPE = { period: PeriodPreset.All, symbol: "SPY" };
		const savedRows = async () => {
			const { eq } = await import("drizzle-orm");
			return db
				.select()
				.from(schema.savedViews)
				.where(eq(schema.savedViews.userId, ALICE));
		};
		const clearViews = async (userId: string) => {
			session.userId = userId;
			const views = await server.views.getSavedViews();
			for (const view of views)
				await server.views.deleteSavedView({ data: { id: view.id } });
		};

		afterAll(async () => {
			await clearViews(ALICE);
			await clearViews(BOB);
		});

		it("keeps a view private to its owner", async () => {
			session.userId = ALICE;
			const { id } = await server.views.createSavedView({
				data: { name: "Alice SPY", scope: SCOPE, portfolioId: ALICE_ACCOUNT },
			});
			const before = await savedRows();
			session.userId = BOB;
			const bobView = await server.views.createSavedView({
				data: { name: "Bob SPY", scope: SCOPE, portfolioId: null },
			});
			const { views } = server;
			const writes: [Promise<unknown>, string][] = [
				[views.renameSavedView({ data: { id, name: "Taken" } }), NOT_FOUND],
				[
					views.updateSavedViewScope({
						data: { id, scope: SCOPE, portfolioId: null },
					}),
					NOT_FOUND,
				],
				[views.deleteSavedView({ data: { id } }), NOT_FOUND],
				[
					views.createSavedView({
						data: { name: "Foreign", scope: SCOPE, portfolioId: ALICE_ACCOUNT },
					}),
					"Account not found.",
				],
				[
					views.updateSavedViewScope({
						data: { id: bobView.id, scope: SCOPE, portfolioId: ALICE_ACCOUNT },
					}),
					"Account not found.",
				],
			];

			const results = await Promise.allSettled(writes.map(([write]) => write));

			expect((await views.getSavedViews()).map((view) => view.id)).toEqual([
				bobView.id,
			]);
			expect(
				results.map((result) =>
					result.status === "rejected" ? result.reason.message : "fulfilled",
				),
			).toEqual(writes.map(([, message]) => message));
			expect(await savedRows()).toEqual(before);
			session.userId = "";
			await expect(views.getSavedViews()).rejects.toThrow("Unauthorized");
		});

		it("keeps a view after its account is deleted, with the active account", async () => {
			session.userId = ALICE;
			const account = await server.accounts.createAccount({
				data: {
					name: "View account",
					description: "",
					kind: AccountKind.Real,
					currency: "USD",
				},
			});
			const { id } = await server.views.createSavedView({
				data: { name: "Pinned", scope: SCOPE, portfolioId: account.id },
			});
			await server.accounts.deleteAccount({
				data: { id: account.id, confirmName: "View account" },
			});

			const view = (await server.views.getSavedViews()).find(
				(item) => item.id === id,
			);
			expect(view).toMatchObject({ portfolioId: null, accountRemoved: true });
		});

		it("rejects a duplicate name in any case, a long name and a 51st view", async () => {
			await clearViews(ALICE);
			const create = (name: string) =>
				server.views.createSavedView({
					data: { name, scope: SCOPE, portfolioId: null },
				});
			await create(" Feb SPY ");
			const second = await create("Second");

			await expect(create("feb spy")).rejects.toThrow(DUPLICATE);
			await expect(
				server.views.renameSavedView({
					data: { id: second.id, name: "FEB SPY" },
				}),
			).rejects.toThrow(DUPLICATE);
			await expect(create("x".repeat(61))).rejects.toThrow(
				"Use 60 characters or fewer.",
			);
			for (let index = 2; index < 50; index += 1) await create(`View ${index}`);
			await expect(create("One too many")).rejects.toThrow(
				"You can save up to 50 views. Delete one first.",
			);
			const names = (await savedRows()).map((row) => row.name);
			expect(names).toHaveLength(50);
			expect(names).toContain("Feb SPY");
		});
	});
});
