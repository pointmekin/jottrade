import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AccountEntryKind } from "@/lib/account-entry";
import type { TradeFilter } from "@/lib/analysis-scope";
import { TradeConfidence, TradeSide, TradeStatus } from "@/lib/trade";
import { TagMatch } from "@/lib/trade-tag";
import { getCalendarData } from "@/server/calendarActions";
import { getAdvancedAnalytics } from "@/server/getAdvancedAnalytics";
import { getAnalytics } from "@/server/getAnalytics";
import { getTrades } from "@/server/getTrades";
import { checkTarget } from "../../scripts/db/target";
import {
	resetIntegrationDatabase,
	transportPool,
} from "./feature-integration-fixture";

const transport = vi.hoisted(() => ({
	query: vi.fn(),
	transaction: vi.fn(),
	userId: "fixture-user",
}));
vi.mock("@/db", async () => {
	const { drizzle } = await import("drizzle-orm/neon-http");
	const schema = await import("@/db/schema");
	return {
		db: drizzle(transport as unknown as NeonQueryFunction<false, false>, {
			schema,
		}),
	};
});
vi.mock("@/lib/auth", () => ({ requireUserId: async () => transport.userId }));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));

/** A local jottrade_test_* database: `npm run db:reset` rules, and the tests drop its schema. */
const url = process.env.SCOPE_TEST_DATABASE_URL;
function requireDisposable(value: string) {
	const target = checkTarget({ DATABASE_URL: value });
	if (!target.ok || !target.database.startsWith("jottrade_test_"))
		throw new Error(
			"SCOPE_TEST_DATABASE_URL must be a local jottrade_test_* database.",
		);
	return value;
}

const OWNER = "fixture-user";
const OTHER = "other-user";
const ACCOUNTS = [
	{ userId: OWNER, portfolioId: 1 },
	{ userId: OWNER, portfolioId: 2 },
	{ userId: OTHER, portfolioId: 3 },
	{ userId: OTHER, portfolioId: 4 },
];
const SYMBOLS = ["EURUSD", "GBPUSD", "XAUUSD"];
const CONFIDENCE = [
	TradeConfidence.High,
	TradeConfidence.Medium,
	TradeConfidence.Low,
	null,
];
const HOUR = 3_600_000;
const START = Date.parse("2026-01-25T00:00:00.000Z");
const FEB = {
	dateFrom: "2026-02-01T00:00:00.000Z",
	dateTo: "2026-02-28T23:59:59.999Z",
};
const FEB_FROM = new Date(FEB.dateFrom);
const MARCH = new Date("2026-03-01T00:00:00.000Z");

type FixtureTrade = {
	portfolioId: number;
	symbol: string;
	side: TradeSide;
	status: TradeStatus;
	entryDate: Date;
	exitDate: Date | null;
	netPnl: number | null;
	hasStrategy: boolean;
	confidence: TradeConfidence | null;
	mistake: string | null;
	tagged: boolean;
};

/** 60 trades per account from 25 Jan to 6 Feb, so many close across the month boundary. */
function fixtureTrades(portfolioId: number): FixtureTrade[] {
	return Array.from({ length: 60 }, (_, i) => {
		const isOpen = i % 7 === 0;
		const entryDate = new Date(START + i * 5 * HOUR);
		let exitDate: Date | null = null;
		if (!isOpen && i % 5 !== 0)
			exitDate = new Date(entryDate.getTime() + (i % 4) * 9 * HOUR);
		return {
			portfolioId,
			symbol: SYMBOLS[i % 3],
			side: i % 2 ? TradeSide.Short : TradeSide.Long,
			status: isOpen ? TradeStatus.Open : TradeStatus.Closed,
			entryDate,
			exitDate,
			netPnl: isOpen ? null : (((i * 37 + portfolioId * 11) % 101) - 50) * 1.25,
			hasStrategy: i % 3 === 0,
			confidence: CONFIDENCE[(i * 3 + 1) % 4],
			mistake: i % 4 === 2 ? "FOMO" : null,
			tagged: i % 4 === 1,
		};
	});
}

const scopeDate = (trade: FixtureTrade) => trade.exitDate ?? trade.entryDate;

describe.skipIf(!url)("one analysis scope on migrated PostgreSQL", () => {
	let pool: Pool;
	const ids = new Map<string, { strategy: number; tag: number }>();
	const trades: FixtureTrade[] = [];

	const insert = async (text: string, values: unknown[]) =>
		(await pool.query(text, values)).rows[0]?.id as number;

	async function insertTrade(userId: string, trade: FixtureTrade) {
		const own = ids.get(userId);
		trades.push(trade);
		const id = await insert(
			"insert into trades(user_id,portfolio_id,symbol,side,status,entry_date,exit_date,net_pnl,setup_id,confidence,mistake) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id",
			[
				userId,
				trade.portfolioId,
				trade.symbol,
				trade.side,
				trade.status,
				trade.entryDate.toISOString(),
				trade.exitDate?.toISOString() ?? null,
				trade.netPnl,
				trade.hasStrategy ? own?.strategy : null,
				trade.confidence,
				trade.mistake,
			],
		);
		if (trade.tagged)
			await pool.query(
				"insert into trade_tags(trade_id,tag_id) values($1,$2)",
				[id, own?.tag],
			);
	}

	async function seed() {
		await pool.query(
			"insert into portfolios(id,user_id,name,currency,review_timezone) values(4,'other-user','Other B','USD','UTC')",
		);
		for (const userId of [OWNER, OTHER])
			ids.set(userId, {
				strategy: await insert(
					"insert into strategies(user_id,name) values($1,'Breakout') returning id",
					[userId],
				),
				tag: await insert(
					"insert into tags(user_id,name) values($1,'A+') returning id",
					[userId],
				),
			});
		for (const { userId, portfolioId } of ACCOUNTS) {
			for (const trade of fixtureTrades(portfolioId))
				await insertTrade(userId, trade);
			await pool.query(
				"insert into cash_flows(user_id,portfolio_id,occurred_at,amount,kind) values($1,$2,'2026-01-01',1000,$3),($1,$2,'2026-02-03',-12.5,$4)",
				[
					userId,
					portfolioId,
					AccountEntryKind.Deposit,
					AccountEntryKind.Adjustment,
				],
			);
		}
		await insertTrade(OWNER, {
			...fixtureTrades(1)[1],
			symbol: "EDGE",
			entryDate: new Date("2026-01-31T22:00:00.000Z"),
			exitDate: new Date("2026-02-01T02:00:00.000Z"),
			netPnl: 40,
			hasStrategy: false,
			confidence: null,
			tagged: false,
		});
	}

	async function totals(filter: Omit<TradeFilter, "portfolioId">) {
		const scope = { portfolioId: 1, timeZone: "UTC", ...filter, ...FEB };
		const [list, analytics, advanced, calendar] = await Promise.all([
			getTrades({ data: { ...scope, page: 1 } }),
			getAnalytics({ data: scope }),
			getAdvancedAnalytics({ data: scope }),
			getCalendarData({
				data: {
					...scope,
					year: 2026,
					month: 2,
					from: FEB.dateFrom,
					to: MARCH.toISOString(),
				},
			}),
		]);
		const calendarTrades = Object.values(calendar).flatMap((day) => day.trades);
		return {
			list: list.closedSummary,
			analytics,
			advancedCount: advanced.riskMetrics.closedTrades,
			calendar: {
				count: calendarTrades.filter((t) => t.status === TradeStatus.Closed)
					.length,
				netPnl: Object.values(calendar).reduce((a, day) => a + day.netPnl, 0),
			},
		};
	}

	beforeAll(async () => {
		pool = transportPool(transport, requireDisposable(url ?? ""));
		transport.userId = OWNER;
		await resetIntegrationDatabase(pool);
		await seed();
	});
	afterAll(async () => {
		await pool?.end();
	});

	const combinations: {
		name: string;
		filter: () => Omit<TradeFilter, "portfolioId">;
		matches: (trade: FixtureTrade) => boolean;
	}[] = [
		{
			name: "symbol",
			filter: () => ({ symbol: "EUR" }),
			matches: (t) => t.symbol === "EURUSD",
		},
		{
			name: "side and confidence",
			filter: () => ({
				side: TradeSide.Short,
				confidence: [TradeConfidence.High, TradeConfidence.Low],
			}),
			matches: (t) =>
				t.side === TradeSide.Short &&
				(t.confidence === TradeConfidence.High ||
					t.confidence === TradeConfidence.Low),
		},
		{
			name: "status",
			filter: () => ({ status: TradeStatus.Closed }),
			matches: () => true,
		},
		{
			name: "strategy",
			filter: () => ({ setupId: ids.get(OWNER)?.strategy }),
			matches: (t) => t.hasStrategy,
		},
		{
			name: "no strategy and mistake",
			filter: () => ({ setupId: "none", mistake: ["FOMO"] }),
			matches: (t) => !t.hasStrategy && t.mistake === "FOMO",
		},
		{
			name: "tag and symbol",
			filter: () => ({
				symbol: "USD",
				tagIds: [ids.get(OWNER)?.tag ?? 0],
				tagMatch: TagMatch.All,
			}),
			matches: (t) => t.tagged,
		},
	];

	it.each(combinations)(
		"agrees on closed February totals in the table, the stats and the calendar: $name",
		async ({ filter, matches }) => {
			const expected = trades.filter(
				(t) =>
					t.portfolioId === 1 &&
					t.status === TradeStatus.Closed &&
					scopeDate(t) >= FEB_FROM &&
					scopeDate(t) < MARCH &&
					matches(t),
			);
			const expectedPnl = expected.reduce((a, t) => a + (t.netPnl ?? 0), 0);

			const result = await totals(filter());

			expect(expected.length).toBeGreaterThan(0);
			expect(result.list).toEqual({
				count: expected.length,
				netPnl: expectedPnl,
			});
			expect(result.analytics.stats.totalTrades).toBe(expected.length);
			expect(result.analytics.stats.totalPnL).toBeCloseTo(expectedPnl, 2);
			expect(result.analytics.scope).toEqual({
				isFiltered: true,
				excludedAdjustments: 1,
			});
			expect(result.advancedCount).toBe(expected.length);
			expect(result.calendar.count).toBe(expected.length);
			expect(result.calendar.netPnl).toBeCloseTo(expectedPnl, 2);
		},
	);

	it("adds the account adjustment to the stats only without a trade filter", async () => {
		const result = await totals({});

		expect(result.calendar.count).toBe(result.list.count);
		expect(result.analytics.stats.totalTrades).toBe(result.list.count);
		expect(result.calendar.netPnl).toBeCloseTo(result.list.netPnl, 2);
		expect(result.analytics.stats.totalPnL).toBeCloseTo(
			result.list.netPnl - 12.5,
			2,
		);
		expect(result.analytics.scope).toEqual({
			isFiltered: false,
			excludedAdjustments: 0,
		});
	});

	it("puts a trade opened on 31 Jan and closed on 1 Feb in February on every screen", async () => {
		const january = await getTrades({
			data: {
				portfolioId: 1,
				page: 1,
				symbol: "EDGE",
				dateFrom: "2026-01-01T00:00:00.000Z",
				dateTo: "2026-01-31T23:59:59.999Z",
			},
		});

		const february = await totals({ symbol: "EDGE" });

		expect(january.total).toBe(0);
		expect(february.list).toEqual({ count: 1, netPnl: 40 });
		expect(february.analytics.stats.totalPnL).toBe(40);
		expect(february.calendar).toEqual({ count: 1, netPnl: 40 });
	});

	it("returns nothing from another user's account", async () => {
		const scope = { portfolioId: 3, timeZone: "UTC", ...FEB };

		const [list, analytics, calendar] = await Promise.all([
			getTrades({ data: { ...scope, page: 1, symbol: "EUR" } }),
			getAnalytics({ data: { ...scope, symbol: "EUR" } }),
			getCalendarData({
				data: {
					...scope,
					year: 2026,
					month: 2,
					from: FEB.dateFrom,
					to: MARCH.toISOString(),
				},
			}),
		]);

		expect(list.trades).toEqual([]);
		expect(list.closedSummary).toEqual({ count: 0, netPnl: 0 });
		expect(analytics.stats.totalTrades).toBe(0);
		expect(analytics.stats.totalBalance).toBe(0);
		expect(calendar).toEqual({});
	});
});
