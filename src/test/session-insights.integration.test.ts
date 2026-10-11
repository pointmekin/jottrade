import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TradingSession } from "@/lib/insights";
import { TradeSide, TradeStatus } from "@/lib/trade";
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

describe.skipIf(!verifyUrl)("session findings on the seeded database", () => {
	let analytics: typeof import("@/server/getAdvancedAnalytics");
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");
	let portfolioId = 0;
	const ids: Record<string, number> = {};

	const addTrade = async (
		userId: string,
		hour: number,
		minute: number,
		netPnl: string,
	) => {
		const [row] = await db
			.insert(schema.trades)
			.values({
				userId,
				portfolioId,
				symbol: "EURUSD",
				side: TradeSide.Long,
				status: TradeStatus.Closed,
				entryDate: new Date(Date.UTC(2026, 2, 2, hour, minute)),
				exitDate: new Date(Date.UTC(2026, 2, 2, 22)),
				netPnl,
			})
			.returning({ id: schema.trades.id });
		return row.id;
	};

	const sessionsFor = async (userId: string) => {
		session.userId = userId;
		const { findings } = await analytics.getAdvancedAnalytics({
			data: { portfolioId, timeZone: "UTC" },
		});
		return new Map(findings.sessions.map((s) => [s.session, s]));
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
			.values({ userId: ALICE, name: "Session insights fixture" })
			.returning({ id: schema.portfolios.id });
		portfolioId = account.id;

		ids.asia = await addTrade(ALICE, 7, 59, "-20");
		ids.london = await addTrade(ALICE, 8, 0, "40");
		// Another user's rows in this account must not change the sessions.
		await addTrade(BOB, 7, 0, "999");
		await addTrade(BOB, 14, 0, "999");
	});

	afterAll(async () => {
		if (!db || !portfolioId) return;
		await db
			.delete(schema.portfolios)
			.where(orm.eq(schema.portfolios.id, portfolioId));
	});

	it("counts only the user's trades in the account", async () => {
		const sessions = await sessionsFor(ALICE);
		expect(sessions.get(TradingSession.Asia)).toMatchObject({
			tradeIds: [ids.asia],
			avgPnl: -20,
			difference: null,
		});
		expect(sessions.get(TradingSession.London)).toMatchObject({
			tradeIds: [ids.london],
			avgPnl: 40,
		});
		expect(sessions.get(TradingSession.NewYork)?.count).toBe(0);
	});

	it("gives another user none of the user's trades", async () => {
		const seen = [...(await sessionsFor(BOB)).values()].flatMap(
			(s) => s.tradeIds,
		);
		expect(seen).not.toContain(ids.asia);
		expect(seen).not.toContain(ids.london);
	});
});
