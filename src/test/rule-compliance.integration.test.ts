import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RiskRuleKind } from "@/lib/risk-rule-evaluation";
import { DailyLossUnit } from "@/lib/risk-rules";
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
const TIMEZONE = "America/New_York";

describe.skipIf(!verifyUrl)("rule compliance on the seeded database", () => {
	let server: typeof import("@/server/riskRuleActions");
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");
	let portfolioId = 0;

	const scope = () => ({ portfolioId, timeZone: "UTC" });

	const addTrade = async (
		userId: string,
		entryISO: string,
		netPnl: string | null = null,
	) => {
		const [row] = await db
			.insert(schema.trades)
			.values({
				userId,
				portfolioId,
				symbol: "EURUSD",
				side: TradeSide.Long,
				status: netPnl === null ? TradeStatus.Open : TradeStatus.Closed,
				entryDate: new Date(entryISO),
				exitDate: netPnl === null ? null : new Date(entryISO),
				netPnl,
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
		server = await import("@/server/riskRuleActions");

		const [account] = await db
			.insert(schema.portfolios)
			.values({
				userId: ALICE,
				name: "Compliance fixture",
				reviewTimezone: TIMEZONE,
			})
			.returning({ id: schema.portfolios.id });
		portfolioId = account.id;
		// A fixture version from a past date; the app writes only now() (no backfill).
		await db.insert(schema.riskRuleVersions).values({
			userId: ALICE,
			portfolioId,
			version: 1,
			rules: {
				v: 1,
				maxTradesPerDay: 2,
				dailyLoss: { unit: DailyLossUnit.Amount, value: "100" },
			},
			timezone: TIMEZONE,
			effectiveFrom: new Date("2026-01-01T00:00:00Z"),
		});
		// 2 Mar in New York: 22:00, 22:30, 23:30. 3 Mar: 00:30 and 09:00.
		await addTrade(ALICE, "2026-03-03T03:00:00Z");
		await addTrade(ALICE, "2026-03-03T03:30:00Z");
		await addTrade(ALICE, "2026-03-03T04:30:00Z");
		await addTrade(ALICE, "2026-03-03T05:30:00Z", "-60");
		await addTrade(ALICE, "2026-03-03T14:00:00Z", "-60");
		// A foreign row on Alice's account must never count or show.
		await addTrade(BOB, "2026-03-03T02:00:00Z", "-500");
	});

	afterAll(async () => {
		if (!db || !portfolioId) return;
		await db
			.delete(schema.portfolios)
			.where(orm.eq(schema.portfolios.id, portfolioId));
	});

	it("equals a SQL count of New York days, with only the user's trades as sources", async () => {
		session.userId = ALICE;
		const { rows: overLimit } = await db.execute<{ day: string; id: number }>(
			orm.sql`
				SELECT to_char(day, 'YYYY-MM-DD') AS day, id FROM (
					SELECT id, (entry_date AT TIME ZONE 'UTC' AT TIME ZONE ${TIMEZONE})::date AS day,
						row_number() OVER (PARTITION BY (entry_date AT TIME ZONE 'UTC' AT TIME ZONE ${TIMEZONE})::date ORDER BY entry_date) AS position
					FROM trades WHERE portfolio_id = ${portfolioId} AND user_id = ${ALICE}
				) ranked WHERE position > 2`,
		);
		const { rows: lossDays } = await db.execute<{ day: string; ids: number[] }>(
			orm.sql`
				SELECT to_char((coalesce(exit_date, entry_date) AT TIME ZONE 'UTC' AT TIME ZONE ${TIMEZONE})::date, 'YYYY-MM-DD') AS day,
					array_agg(id ORDER BY coalesce(exit_date, entry_date)) AS ids
				FROM trades
				WHERE portfolio_id = ${portfolioId} AND user_id = ${ALICE} AND status = ${TradeStatus.Closed}
				GROUP BY 1 HAVING -sum(net_pnl) >= 100`,
		);

		const result = await server.getRuleCompliance({ data: scope() });
		const ofKind = (kind: string) =>
			result?.violations.filter((item) => item.kind === kind) ?? [];

		expect(overLimit).toHaveLength(1);
		expect(
			ofKind(RiskRuleKind.DailyTradeCount).map((item) => ({
				day: item.dayKey,
				id: item.sourceTradeIds[0],
			})),
		).toEqual(overLimit);
		expect(lossDays).toHaveLength(1);
		expect(
			ofKind(RiskRuleKind.DailyLoss).map((item) => ({
				day: item.dayKey,
				ids: item.sourceTradeIds,
			})),
		).toEqual(lossDays);
		expect(result?.tallies).toEqual([
			expect.objectContaining({
				kind: RiskRuleKind.DailyLoss,
				violated: 1,
				pass: 0,
			}),
			expect.objectContaining({
				kind: RiskRuleKind.DailyTradeCount,
				violated: 1,
				pass: 1,
			}),
		]);
	});

	it("returns today with the version and the timezone, only to the owner", async () => {
		session.userId = ALICE;
		expect(await server.getRuleToday({ data: { portfolioId } })).toMatchObject({
			version: 1,
			timezone: TIMEZONE,
			trades: { limit: 2, entered: 0 },
		});

		session.userId = BOB;
		await expect(
			server.getRuleToday({ data: { portfolioId } }),
		).rejects.toThrow("Account not found.");
		await expect(server.getRuleCompliance({ data: scope() })).rejects.toThrow(
			"Account not found.",
		);
	});

	it("returns null for an account with no rules", async () => {
		session.userId = BOB;
		expect(await server.getRuleToday({ data: { portfolioId: 4 } })).toBeNull();
		expect(
			await server.getRuleCompliance({
				data: { portfolioId: 4, timeZone: "UTC" },
			}),
		).toBeNull();
	});
});
