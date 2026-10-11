import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { TradeSide, TradeStatus } from "@/lib/trade";
import type { InitialRiskSnapshot } from "@/lib/trade-risk-schema";
import { checkTarget } from "../../scripts/db/target";

// Runs in `npm run verify` on the seeded database, as tag-insights.integration.test.ts.
const verifyUrl = process.env.VERIFY_DATABASE_URL;

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
	requireUserId: async () => {
		if (!session.userId) throw new Error("Unauthorized");
		return session.userId;
	},
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));

const ALICE = "seed-alice";
const BOB = "seed-bob";

describe.skipIf(!verifyUrl)(
	"sizing after a loss on the seeded database",
	() => {
		let analytics: typeof import("@/server/getAdvancedAnalytics");
		let db: typeof import("@/db").db;
		let schema: typeof import("@/db/schema");
		let orm: typeof import("drizzle-orm");
		let portfolioId = 0;
		const ids: Record<string, number> = {};

		const addTrade = async (
			userId: string,
			entryHour: number,
			netPnl: string,
			initialRiskAmount: string | null,
			accountCurrency = DEFAULT_CURRENCY,
		) => {
			const [row] = await db
				.insert(schema.trades)
				.values({
					userId,
					portfolioId,
					symbol: "EURUSD",
					side: TradeSide.Long,
					status: TradeStatus.Closed,
					entryDate: new Date(Date.UTC(2026, 2, 2, entryHour)),
					exitDate: new Date(Date.UTC(2026, 2, 2, entryHour, 30)),
					netPnl,
					initialRiskAmount,
					initialRiskSnapshot: { accountCurrency } as InitialRiskSnapshot,
				})
				.returning({ id: schema.trades.id });
			return row.id;
		};

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
			analytics = await import("@/server/getAdvancedAnalytics");

			const [account] = await db
				.insert(schema.portfolios)
				.values({ userId: ALICE, name: "Sizing insights fixture" })
				.returning({ id: schema.portfolios.id });
			portfolioId = account.id;

			ids.loss = await addTrade(ALICE, 1, "-50", "100");
			// Another user's rows in this account must not change the cohorts.
			await addTrade(BOB, 2, "10", "999");
			ids.afterLoss = await addTrade(ALICE, 3, "40", null);
			await addTrade(BOB, 4, "-10", "999");
			ids.win = await addTrade(ALICE, 5, "20", "80");
			ids.euro = await addTrade(ALICE, 7, "15", "500", "EUR");
		});

		afterAll(async () => {
			if (!db || !portfolioId) return;
			await db
				.delete(schema.portfolios)
				.where(orm.eq(schema.portfolios.id, portfolioId));
		});

		it("counts only the user's trades in the account", async () => {
			session.userId = ALICE;
			const { findings } = await analytics.getAdvancedAnalytics({
				data: { portfolioId, timeZone: "UTC" },
			});
			expect(findings.sizing).toEqual({
				afterLoss: { tradeIds: [ids.afterLoss], withRisk: 0, medianRisk: null },
				other: {
					tradeIds: expect.arrayContaining([ids.loss, ids.win, ids.euro]),
					withRisk: 2,
					medianRisk: 90,
				},
				change: null,
			});
			expect(findings.sizing.other.tradeIds).toHaveLength(3);
		});

		it("gives another user none of the user's trades", async () => {
			session.userId = BOB;
			const { findings } = await analytics.getAdvancedAnalytics({
				data: { portfolioId, timeZone: "UTC" },
			});
			const seen = [
				...findings.sizing.afterLoss.tradeIds,
				...findings.sizing.other.tradeIds,
			];
			expect(seen).not.toContain(ids.loss);
			expect(seen).not.toContain(ids.afterLoss);
			expect(seen).not.toContain(ids.win);
			expect(seen).not.toContain(ids.euro);
		});
	},
);
