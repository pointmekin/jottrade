import { beforeAll, describe, expect, it, vi } from "vitest";
import { PlaybookCriterionKind } from "@/lib/playbook";
import { TradeSide } from "@/lib/trade";
import { BulkTradeAction } from "@/lib/trade-tag";
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
const BOB_ACCOUNT = 4;
const ALICE_STRATEGY = 1;
const STRATEGY_UNAVAILABLE =
	"This strategy no longer exists or is archived. Nothing was changed.";
const CRITERION = {
	id: "c1",
	kind: PlaybookCriterionKind.Entry,
	text: "Close above the range",
	required: true,
};

describe.skipIf(!verifyUrl)("strategy isolation on the seeded database", () => {
	let server: {
		trades: typeof import("@/server/tradeActions");
		strategies: typeof import("@/server/strategyActions");
		tags: typeof import("@/server/tagActions");
	};
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");

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
			strategies: await import("@/server/strategyActions"),
			tags: await import("@/server/tagActions"),
		};
	});
	it("rejects another user's strategy on a trade create, edit or bulk edit", async () => {
		session.userId = BOB;
		const { eq } = await import("drizzle-orm");
		const bobTrades = () =>
			db.select().from(schema.trades).where(eq(schema.trades.userId, BOB));
		const before = await bobTrades();
		const bobTrade = before[0];
		const writes = [
			server.trades.createTrade({
				data: {
					portfolioId: BOB_ACCOUNT,
					symbol: "INTRUDER",
					side: TradeSide.Long,
					entryDate: "2026-09-01T08:00:00Z",
					entryPrice: "100",
					quantity: "1",
					setupId: ALICE_STRATEGY,
				},
			}),
			server.trades.updateTrade({
				data: { id: bobTrade.id, setupId: ALICE_STRATEGY },
			}),
			server.tags.bulkEditTrades({
				data: {
					portfolioId: BOB_ACCOUNT,
					tradeIds: [bobTrade.id],
					change: {
						action: BulkTradeAction.SetStrategy,
						setupId: ALICE_STRATEGY,
					},
				},
			}),
		];
		const results = await Promise.allSettled(writes);

		expect(
			results.map((result) =>
				result.status === "rejected" ? result.reason.message : "fulfilled",
			),
		).toEqual(writes.map(() => STRATEGY_UNAVAILABLE));
		expect(await bobTrades()).toEqual(before);
	});

	describe("strategy playbooks", () => {
		const strategyRow = async (id: number) => {
			const { eq } = await import("drizzle-orm");
			const [row] = await db
				.select()
				.from(schema.strategies)
				.where(eq(schema.strategies.id, id));
			return row;
		};
		const createAliceStrategy = (name: string) => {
			session.userId = ALICE;
			return server.strategies.createStrategy({ data: { name, criteria: [] } });
		};

		it("increases the criteria version only when the criteria or the risk guidance change", async () => {
			const { id } = await createAliceStrategy("Versioned");
			const versions: number[] = [];
			for (const fields of [
				{ name: "Renamed", riskGuidance: "" },
				{ criteria: [CRITERION] },
				{ criteria: [CRITERION] },
				{ criteria: [CRITERION], riskGuidance: "Risk 1%" },
			]) {
				const saved = await server.strategies.updateStrategy({
					data: { id, name: "Versioned", criteria: [], ...fields },
				});
				versions.push(saved.criteriaVersion);
			}

			expect(versions).toEqual([1, 2, 2, 3]);
			await server.strategies.deleteStrategy({ data: { id } });
			expect(await strategyRow(id)).toBeUndefined();
		});

		it("lets only the owner archive, restore, edit or delete an archived strategy", async () => {
			const { id } = await createAliceStrategy("Archived");
			await server.strategies.archiveStrategy({ data: { id, archived: true } });
			const before = await strategyRow(id);
			expect(before.archivedAt).toBeInstanceOf(Date);

			session.userId = BOB;
			const { strategies } = server;
			const writes = [
				strategies.archiveStrategy({ data: { id, archived: true } }),
				strategies.archiveStrategy({ data: { id, archived: false } }),
				strategies.updateStrategy({
					data: { id, name: "Taken", criteria: [CRITERION] },
				}),
				strategies.deleteStrategy({ data: { id } }),
			];
			const results = await Promise.allSettled(writes);

			expect(
				results.map((result) =>
					result.status === "rejected" ? result.reason.message : "fulfilled",
				),
			).toEqual(writes.map(() => "Strategy not found"));
			expect(await strategyRow(id)).toEqual(before);

			session.userId = ALICE;
			const restored = await strategies.archiveStrategy({
				data: { id, archived: false },
			});
			expect(restored.archivedAt).toBeNull();
			await strategies.deleteStrategy({ data: { id } });
		});

		it("keeps an archived strategy on its trades and refuses it on a new assignment", async () => {
			const { eq } = await import("drizzle-orm");
			session.userId = BOB;
			const { id } = await server.strategies.createStrategy({
				data: { name: "Archived setup", criteria: [] },
			});
			await server.trades.createTrade({
				data: {
					portfolioId: BOB_ACCOUNT,
					symbol: "PLAYBOOK",
					side: TradeSide.Long,
					entryDate: "2026-09-01T08:00:00Z",
					entryPrice: "100",
					quantity: "1",
					setupId: id,
				},
			});
			const [trade] = await db
				.select()
				.from(schema.trades)
				.where(eq(schema.trades.symbol, "PLAYBOOK"));
			expect(trade.setupId).toBe(id);
			await server.strategies.archiveStrategy({ data: { id, archived: true } });

			await expect(
				server.trades.createTrade({
					data: {
						portfolioId: BOB_ACCOUNT,
						symbol: "PLAYBOOK",
						side: TradeSide.Long,
						entryDate: "2026-09-01T08:00:00Z",
						entryPrice: "100",
						quantity: "1",
						setupId: id,
					},
				}),
			).rejects.toThrow(STRATEGY_UNAVAILABLE);
			await expect(
				server.tags.bulkEditTrades({
					data: {
						portfolioId: BOB_ACCOUNT,
						tradeIds: [trade.id],
						change: { action: BulkTradeAction.SetStrategy, setupId: id },
					},
				}),
			).rejects.toThrow(STRATEGY_UNAVAILABLE);
			await server.trades.updateTrade({
				data: { id: trade.id, setupId: id, targetPrice: "110" },
			});
			const [saved] = await db
				.select()
				.from(schema.trades)
				.where(eq(schema.trades.symbol, "PLAYBOOK"));
			expect(saved).toMatchObject({ setupId: id, targetPrice: "110" });

			await server.trades.deleteTrade({ data: { id: trade.id } });
			await server.strategies.deleteStrategy({ data: { id } });
		});

		it("refuses to delete a used strategy and keeps the link on its trades", async () => {
			const { eq } = await import("drizzle-orm");
			const linked = () =>
				db
					.select()
					.from(schema.trades)
					.where(eq(schema.trades.setupId, ALICE_STRATEGY));
			const before = await linked();
			expect(before.length).toBeGreaterThan(0);
			session.userId = ALICE;

			expect(
				await server.strategies.deleteStrategy({
					data: { id: ALICE_STRATEGY },
				}),
			).toEqual({ deleted: false, usedBy: before.length });

			expect(await linked()).toEqual(before);
		});
	});
});
