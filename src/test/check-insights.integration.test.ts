import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toDateRange } from "@/lib/analysis-scope";
import {
	ChartGroup,
	drillDownSearch,
	journalSearchSchema,
	toTradeQuery,
} from "@/lib/journal-search";
import { PlanAdherence, type PlaybookCheck } from "@/lib/playbook-check";
import {
	RiskRuleKind,
	RULES_UNREADABLE,
	RuleOutcome,
	type StoredRuleCheck,
} from "@/lib/risk-rule-evaluation";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { RiskCaptureSource } from "@/lib/trade-risk-schema";
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

const planCheck = (
	strategyId: number,
	result: PlaybookCheck["result"],
): PlaybookCheck => ({
	v: 1,
	strategyId,
	strategyName: "Check insights",
	criteriaVersion: 1,
	items: [],
	result,
	checkedAt: "2026-03-02T12:00:00.000Z",
});

const ruleCheck = (...outcomes: RuleOutcome[]): StoredRuleCheck => ({
	v: 1,
	version: 1,
	timezone: "UTC",
	dayKey: "2026-03-02",
	outcomes: outcomes.map((outcome) => ({
		kind: RiskRuleKind.DailyTradeCount,
		outcome,
		limit: null,
		actual: null,
		reason: null,
		until: null,
	})),
	evaluatedAt: "2026-03-02T10:00:00.000Z",
	captureSource: RiskCaptureSource.Manual,
	acknowledged: true,
	note: null,
	reason: null,
});

describe.skipIf(!verifyUrl)("check insights on the seeded database", () => {
	let analytics: typeof import("@/server/getAdvancedAnalytics");
	let tradeList: typeof import("@/server/getTrades");
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");
	let portfolioId = 0;
	let strategyId = 0;

	const scope = () => ({ portfolioId, timeZone: "UTC" });

	const addTrade = (
		netPnl: string,
		fields: {
			status?: TradeStatus;
			setupId?: number;
			playbookCheck?: PlaybookCheck;
			ruleCheck?: StoredRuleCheck;
		} = {},
	) =>
		db.insert(schema.trades).values({
			userId: ALICE,
			portfolioId,
			symbol: "EURUSD",
			side: TradeSide.Long,
			status: TradeStatus.Closed,
			entryDate: new Date("2026-03-02T10:00:00Z"),
			exitDate: new Date("2026-03-02T11:00:00Z"),
			netPnl,
			...fields,
		});

	const groupTotals = async (group: ChartGroup, key: string) => {
		const search = journalSearchSchema.parse(drillDownSearch(group, key));
		const query = toTradeQuery(search, toDateRange({}));
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
			.values({ userId: ALICE, name: "Check insights fixture" })
			.returning({ id: schema.portfolios.id });
		portfolioId = account.id;
		const [strategy] = await db
			.insert(schema.strategies)
			.values({ userId: ALICE, name: "Check insights" })
			.returning({ id: schema.strategies.id });
		strategyId = strategy.id;

		await addTrade("100", {
			setupId: strategyId,
			playbookCheck: planCheck(strategyId, PlanAdherence.Followed),
			ruleCheck: ruleCheck(RuleOutcome.Pass, RuleOutcome.NotSet),
		});
		await addTrade("-40", {
			setupId: strategyId,
			playbookCheck: planCheck(strategyId, PlanAdherence.Broken),
			ruleCheck: ruleCheck(RuleOutcome.Pass, RuleOutcome.Violated),
		});
		// A check for another strategy is stale, so the trade is not checked.
		await addTrade("20", {
			playbookCheck: planCheck(strategyId, PlanAdherence.Followed),
			ruleCheck: ruleCheck(RuleOutcome.Unknown, RuleOutcome.Pass),
		});
		await addTrade("7");
		await addTrade("3", {
			ruleCheck: { ...ruleCheck(), version: null, reason: RULES_UNREADABLE },
		});
		await addTrade("5", { ruleCheck: ruleCheck(RuleOutcome.NotSet) });
		await addTrade("0", {
			status: TradeStatus.Open,
			ruleCheck: ruleCheck(RuleOutcome.Violated),
		});
	});

	afterAll(async () => {
		if (!db || !portfolioId) return;
		await db
			.delete(schema.portfolios)
			.where(orm.eq(schema.portfolios.id, portfolioId));
		if (strategyId)
			await db
				.delete(schema.strategies)
				.where(orm.eq(schema.strategies.id, strategyId));
	});

	it("opens the same closed count and net P&L as each plan adherence bar", async () => {
		session.userId = ALICE;
		const { byAdherence, insightCoverage } =
			await analytics.getAdvancedAnalytics({ data: scope() });

		expect(insightCoverage.planChecked).toBe(2);

		expect(byAdherence.map(({ key, count }) => ({ key, count }))).toEqual([
			{ key: PlanAdherence.Followed, count: 1 },
			{ key: PlanAdherence.Broken, count: 1 },
			{ key: PlanAdherence.Unchecked, count: 4 },
		]);
		for (const group of byAdherence) {
			const totals = await groupTotals(ChartGroup.Adherence, group.key);
			expect(totals.count, group.name).toBe(group.count);
			expect(totals.netPnl, group.name).toBeCloseTo(group.totalPnl, 2);
		}
	});

	it("opens the same closed count and net P&L as each rule check bar", async () => {
		session.userId = ALICE;
		const { byRuleCheck, insightCoverage } =
			await analytics.getAdvancedAnalytics({ data: scope() });

		expect(insightCoverage.ruleChecked).toBe(4);

		expect(byRuleCheck.map(({ key, count }) => ({ key, count }))).toEqual([
			{ key: RuleOutcome.Pass, count: 1 },
			{ key: RuleOutcome.Violated, count: 1 },
			{ key: RuleOutcome.Unknown, count: 2 },
			{ key: RuleOutcome.NotSet, count: 2 },
		]);
		for (const group of byRuleCheck) {
			const totals = await groupTotals(ChartGroup.RuleCheck, group.key);
			expect(totals.count, group.name).toBe(group.count);
			expect(totals.netPnl, group.name).toBeCloseTo(group.totalPnl, 2);
		}
	});

	it("does not show the groups of another user", async () => {
		session.userId = BOB;
		const { byAdherence, byRuleCheck, insightCoverage } =
			await analytics.getAdvancedAnalytics({ data: scope() });
		expect(byAdherence).toEqual([]);
		expect(byRuleCheck).toEqual([]);
		expect(insightCoverage).toEqual({
			tagged: 0,
			planChecked: 0,
			ruleChecked: 0,
		});
	});
});
