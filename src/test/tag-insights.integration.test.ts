import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toDateRange } from "@/lib/analysis-scope";
import {
	ChartGroup,
	drillDownSearch,
	journalSearchSchema,
	toTradeQuery,
} from "@/lib/journal-search";
import { TradeSide, TradeStatus } from "@/lib/trade";
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

describe.skipIf(!verifyUrl)("tag insights on the seeded database", () => {
	let analytics: typeof import("@/server/getAdvancedAnalytics");
	let tradeList: typeof import("@/server/getTrades");
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");
	let portfolioId = 0;
	const tagIds: number[] = [];

	const scope = () => ({ portfolioId, timeZone: "UTC" });

	const addTrade = async (
		netPnl: string,
		status: TradeStatus = TradeStatus.Closed,
	) => {
		const [row] = await db
			.insert(schema.trades)
			.values({
				userId: ALICE,
				portfolioId,
				symbol: "EURUSD",
				side: TradeSide.Long,
				status,
				entryDate: new Date("2026-03-02T10:00:00Z"),
				exitDate: new Date("2026-03-02T11:00:00Z"),
				netPnl,
			})
			.returning({ id: schema.trades.id });
		return row.id;
	};

	const addTag = async (userId: string, name: string) => {
		const [row] = await db
			.insert(schema.tags)
			.values({ userId, name })
			.returning({ id: schema.tags.id });
		tagIds.push(row.id);
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
		tradeList = await import("@/server/getTrades");

		const [account] = await db
			.insert(schema.portfolios)
			.values({ userId: ALICE, name: "Tag insights fixture" })
			.returning({ id: schema.portfolios.id });
		portfolioId = account.id;

		const late = await addTag(ALICE, "Insight late entry");
		const fomo = await addTag(ALICE, "Insight FOMO");
		const foreign = await addTag(BOB, "Insight foreign");
		const both = await addTrade("-40");
		const lateOnly = await addTrade("100");
		await addTrade("500");
		const open = await addTrade("0", TradeStatus.Open);
		// A foreign tag on Alice's trade must never show.
		await db.insert(schema.tradeTags).values([
			{ tradeId: both, tagId: late },
			{ tradeId: both, tagId: fomo },
			{ tradeId: lateOnly, tagId: late },
			{ tradeId: open, tagId: fomo },
			{ tradeId: lateOnly, tagId: foreign },
		]);
	});

	afterAll(async () => {
		if (!db || !portfolioId) return;
		await db
			.delete(schema.portfolios)
			.where(orm.eq(schema.portfolios.id, portfolioId));
		if (tagIds.length)
			await db.delete(schema.tags).where(orm.inArray(schema.tags.id, tagIds));
	});

	it("opens the same closed count and net P&L as each tag bar", async () => {
		session.userId = ALICE;
		const { byTag, findings, insightCoverage, riskMetrics } =
			await analytics.getAdvancedAnalytics({ data: scope() });

		expect(insightCoverage.tagged).toBe(2);
		expect(riskMetrics.closedTrades).toBe(3);
		expect(byTag.map(({ name, count }) => ({ name, count }))).toEqual([
			{ name: "Insight late entry", count: 2 },
			{ name: "Insight FOMO", count: 1 },
		]);
		for (const group of byTag) {
			const search = journalSearchSchema.parse(
				drillDownSearch(ChartGroup.Tag, group.key),
			);
			const query = toTradeQuery(search, toDateRange({}));
			const { closedSummary } = await tradeList.getTrades({
				data: { ...scope(), ...query },
			});
			expect(closedSummary.count, group.name).toBe(group.count);
			expect(closedSummary.netPnl, group.name).toBeCloseTo(group.totalPnl, 2);
		}
		expect(findings.scope).toEqual({ count: 3, avgPnl: 186.67 });
		expect(
			findings.tags.map(({ name, difference }) => ({ name, difference })),
		).toEqual([
			{ name: "Insight late entry", difference: null },
			{ name: "Insight FOMO", difference: null },
		]);
	});

	it("returns no tag groups under a tag filter", async () => {
		session.userId = ALICE;
		const { byTag, findings, insightCoverage } =
			await analytics.getAdvancedAnalytics({
				data: { ...scope(), tagIds: [tagIds[0]] },
			});
		expect(byTag).toEqual([]);
		expect(findings.tags).toEqual([]);
		expect(insightCoverage.tagged).toBeNull();
	});
});
