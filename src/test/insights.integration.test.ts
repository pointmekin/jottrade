import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toDateRange } from "@/lib/analysis-scope";
import { InsightFormula } from "@/lib/insights";
import {
	drillDownSearch,
	journalSearchSchema,
	toTradeQuery,
} from "@/lib/journal-search";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { TradingSession } from "@/lib/trading-session";
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

const ALICE = "seed-alice";
const BOB = "seed-bob";

describe.skipIf(!verifyUrl)("insights on the seeded database", () => {
	let analytics: typeof import("@/server/getAdvancedAnalytics");
	let tradeList: typeof import("@/server/getTrades");
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");
	let portfolioId = 0;
	let tagId = 0;

	const scope = () => ({ portfolioId, timeZone: "UTC" });

	const addTrades = async (
		count: number,
		netPnl: string,
		entry: string,
		status: TradeStatus = TradeStatus.Closed,
	) => {
		const rows = await db
			.insert(schema.trades)
			.values(
				Array.from({ length: count }, (_, day) => ({
					userId: ALICE,
					portfolioId,
					symbol: "EURUSD",
					side: TradeSide.Long,
					status,
					entryDate: new Date(
						`2026-03-${String(day + 1).padStart(2, "0")}T${entry}:00Z`,
					),
					exitDate: new Date(
						`2026-03-${String(day + 1).padStart(2, "0")}T23:30:00Z`,
					),
					netPnl,
				})),
			)
			.returning({ id: schema.trades.id });
		return rows.map((row) => row.id);
	};

	const journalTotals = async (search: object) => {
		const query = toTradeQuery(
			journalSearchSchema.parse(search),
			toDateRange({}),
		);
		const { closedSummary } = await tradeList.getTrades({
			data: { ...scope(), ...query },
		});
		return closedSummary;
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
		tradeList = await import("@/server/getTrades");

		const [account] = await db
			.insert(schema.portfolios)
			.values({ userId: ALICE, name: "Insights fixture" })
			.returning({ id: schema.portfolios.id });
		portfolioId = account.id;
		const [tag] = await db
			.insert(schema.tags)
			.values({ userId: ALICE, name: "Insight revenge" })
			.returning({ id: schema.tags.id });
		tagId = tag.id;

		const asia = await addTrades(20, "-30", "07:59");
		await addTrades(20, "50", "13:00");
		await addTrades(1, "5", "08:00");
		const open = await addTrades(1, "0", "03:00", TradeStatus.Open);
		await db
			.insert(schema.tradeTags)
			.values([...asia, ...open].map((tradeId) => ({ tradeId, tagId })));
	});

	afterAll(async () => {
		if (!db || !portfolioId) return;
		await db
			.delete(schema.portfolios)
			.where(orm.eq(schema.portfolios.id, portfolioId));
		if (tagId)
			await db.delete(schema.tags).where(orm.eq(schema.tags.id, tagId));
	});

	it("opens the same closed count and net P&L as each linked cohort", async () => {
		session.userId = ALICE;
		const { insights } = await analytics.getAdvancedAnalytics({
			data: scope(),
		});

		expect(
			insights.map(({ formula, key, sample, difference }) => ({
				formula,
				key,
				sample,
				difference,
			})),
		).toEqual([
			{
				formula: InsightFormula.TagAvgPnlVsScope,
				key: String(tagId),
				sample: 20,
				difference: -39.88,
			},
			{
				formula: InsightFormula.SessionAvgPnlVsScope,
				key: TradingSession.Asia,
				sample: 20,
				difference: -39.88,
			},
			{
				formula: InsightFormula.SessionAvgPnlVsScope,
				key: TradingSession.London,
				sample: 1,
				difference: null,
			},
			{
				formula: InsightFormula.SessionAvgPnlVsScope,
				key: TradingSession.NewYork,
				sample: 20,
				difference: 40.12,
			},
		]);
		const scopeTotals = await journalTotals({ status: TradeStatus.Closed });
		for (const insight of insights) {
			const cohortTotals = await journalTotals(
				drillDownSearch(insight.group, insight.key),
			);
			expect(cohortTotals.count, insight.name).toBe(insight.cohort.count);
			expect(cohortTotals.netPnl, insight.name).toBeCloseTo(
				insight.cohort.totalPnl,
				2,
			);
			expect(scopeTotals.count).toBe(insight.comparison.count);
			expect(scopeTotals.netPnl).toBeCloseTo(insight.comparison.totalPnl, 2);
			expect(insight.portfolioId).toBe(portfolioId);
		}
	});

	it("does not show the insights of another user", async () => {
		session.userId = BOB;
		const { insights } = await analytics.getAdvancedAnalytics({
			data: scope(),
		});
		expect(insights).toEqual([]);
	});
});
