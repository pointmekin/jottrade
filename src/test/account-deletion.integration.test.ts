import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AccountEntryKind } from "@/lib/account-entry";
import { ReviewKind } from "@/lib/review";
import { TradeSide } from "@/lib/trade";

// `npm run verify` runs this file on its disposable database, through the
// real Better Auth instance in src/lib/auth.ts.
const verifyUrl = process.env.VERIFY_DATABASE_URL;

const gcp = vi.hoisted(() => ({ deleteGcpPrefix: vi.fn() }));
vi.mock("@/lib/gcp", async (importOriginal) => ({
	...(await importOriginal<object>()),
	...gcp,
}));

const PASSWORD = "jottrade-dev-password";
const MEDIA_FAILED = "GCP delete failed: 503";

type Fixture = Awaited<ReturnType<typeof seedUser>>;

let auth: typeof import("@/lib/auth").auth;
let db: typeof import("@/db").db;
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");

async function seedUser() {
	const email = `deletion-${randomUUID()}@jottrade.test`;
	const { headers, response } = await auth.api.signUpEmail({
		body: { name: "Deletion Fixture", email, password: PASSWORD },
		returnHeaders: true,
	});
	const cookie = new Headers({
		cookie: headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; "),
	});
	const userId = response.user.id;
	const { eq } = orm;
	const [portfolio] = await db
		.select({ id: schema.portfolios.id })
		.from(schema.portfolios)
		.where(eq(schema.portfolios.userId, userId));
	const portfolioId = portfolio.id;

	const [trade] = await db
		.insert(schema.trades)
		.values({
			portfolioId,
			userId,
			symbol: "EURUSD",
			side: TradeSide.Long,
			entryDate: new Date("2026-10-01T09:00:00Z"),
			screenshots: [
				`https://storage.googleapis.com/b/trades/${userId}/1/a.png`,
			],
		})
		.returning({ id: schema.trades.id });
	const [cashFlow] = await db
		.insert(schema.cashFlows)
		.values({
			userId,
			portfolioId,
			occurredAt: new Date("2026-10-01T08:00:00Z"),
			amount: "100",
			kind: AccountEntryKind.Deposit,
		})
		.returning({ id: schema.cashFlows.id });
	await db.insert(schema.strategies).values({ userId, name: "Breakout" });
	const [tag] = await db
		.insert(schema.tags)
		.values({ userId, name: "A+" })
		.returning({ id: schema.tags.id });
	await db
		.insert(schema.tradeTags)
		.values({ tradeId: trade.id, tagId: tag.id });
	const [review] = await db
		.insert(schema.reviewPeriods)
		.values({
			userId,
			portfolioId,
			kind: ReviewKind.Daily,
			periodStart: "2026-10-01",
			periodEndExclusive: "2026-10-02",
			timezoneSnapshot: "UTC",
			weekStartsOnSnapshot: 1,
			currencySnapshot: "USD",
		})
		.returning({ id: schema.reviewPeriods.id });
	await db.insert(schema.reviewSourceTrades).values({
		reviewId: review.id,
		tradeId: trade.id,
		executionFingerprint: "fixture",
		snapshot: {} as never,
	});
	await db.insert(schema.reviewSourceCashFlows).values({
		reviewId: review.id,
		cashFlowId: cashFlow.id,
		executionFingerprint: "fixture",
		snapshot: {} as never,
	});
	await db.insert(schema.savedViews).values({
		userId,
		portfolioId,
		name: "Fixture view",
		scope: {},
	});
	await db.insert(schema.riskRuleVersions).values({
		userId,
		portfolioId,
		version: 1,
		rules: { v: 1, maxTradesPerDay: 3 },
		timezone: "UTC",
	});
	const batchId = randomUUID();
	await db.insert(schema.importBatches).values({
		id: batchId,
		userId,
		portfolioId,
		kind: "trades",
		fileName: "fixture.csv",
		fileHash: "fixture",
		sourceCurrency: "USD",
		rows: [],
		summary: {} as never,
		expiresAt: new Date("2026-10-02T00:00:00Z"),
	});
	await db.insert(schema.importIdentities).values({
		userId,
		portfolioId,
		kind: "trade",
		fingerprint: "fixture",
		tradeId: trade.id,
		recordedRecordId: trade.id,
		batchId,
	});
	await db
		.insert(schema.userOnboarding)
		.values({ userId })
		.onConflictDoNothing();

	return { userId, cookie, tradeId: trade.id, reviewId: review.id };
}

// Every table with a foreign key to "user", plus the link tables below them.
async function rowCounts({ userId, tradeId, reviewId }: Fixture) {
	const { sql } = orm;
	const { rows: owners } = await db.execute<{
		table: string;
		column: string;
	}>(sql`
		select c.conrelid::regclass::text as table, a.attname as column
		from pg_constraint c
		join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
		where c.contype = 'f' and c.confrelid = '"user"'::regclass
		order by 1`);
	const counts: Record<string, number> = {};
	const count = async (
		table: string,
		column: string,
		value: string | number,
	) => {
		const { rows } = await db.execute<{ count: number }>(
			sql`select count(*)::int as count from ${sql.identifier(table)} where ${sql.identifier(column)} = ${value}`,
		);
		counts[table] = rows[0].count;
	};
	await count("user", "id", userId);
	for (const { table, column } of owners) await count(table, column, userId);
	await count("trade_tags", "trade_id", tradeId);
	await count("review_source_trades", "review_id", reviewId);
	await count("review_source_cash_flows", "review_id", reviewId);
	return counts;
}

async function allTables() {
	const { rows } = await db.execute<{ name: string }>(
		orm.sql`select tablename as name from pg_tables where schemaname = 'public' and tablename <> 'verification' order by 1`,
	);
	return rows.map((row) => row.name);
}

describe.skipIf(!verifyUrl)("account deletion on the verify database", () => {
	beforeAll(async () => {
		expect(process.env.DATABASE_URL).toBe(verifyUrl);
		({ auth } = await import("@/lib/auth"));
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		orm = await import("drizzle-orm");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	it("the fixture has rows in every user-owned table", async () => {
		const counts = await rowCounts(await seedUser());

		expect(Object.keys(counts).sort()).toEqual(await allTables());
		for (const [table, count] of Object.entries(counts)) {
			expect(count, table).toBeGreaterThan(0);
		}
	});

	it("deletes the media and every row of the user, and no row of another user", async () => {
		vi.stubEnv("GCP_BUCKET_NAME", "test-bucket");
		gcp.deleteGcpPrefix.mockResolvedValue(undefined);
		const alice = await seedUser();
		const bob = await seedUser();
		const bobBefore = await rowCounts(bob);

		await auth.api.deleteUser({
			body: { password: PASSWORD },
			headers: alice.cookie,
		});

		expect(gcp.deleteGcpPrefix).toHaveBeenCalledExactlyOnceWith(
			`trades/${alice.userId}/`,
		);
		for (const [table, count] of Object.entries(await rowCounts(alice))) {
			expect(count, table).toBe(0);
		}
		expect(await rowCounts(bob)).toEqual(bobBefore);
		expect(await auth.api.getSession({ headers: alice.cookie })).toBeNull();
		expect(await auth.api.getSession({ headers: bob.cookie })).not.toBeNull();
	});

	it("a wrong or missing password deletes nothing", async () => {
		vi.stubEnv("GCP_BUCKET_NAME", "test-bucket");
		const alice = await seedUser();
		const before = await rowCounts(alice);

		await expect(
			auth.api.deleteUser({
				body: { password: "wrong" },
				headers: alice.cookie,
			}),
		).rejects.toThrow("Invalid password");
		await expect(
			auth.api.deleteUser({ body: {}, headers: alice.cookie }),
		).rejects.toThrow("Invalid password");

		expect(gcp.deleteGcpPrefix).not.toHaveBeenCalled();
		expect(await rowCounts(alice)).toEqual(before);
	});

	it("a media-delete failure deletes nothing", async () => {
		vi.stubEnv("GCP_BUCKET_NAME", "test-bucket");
		gcp.deleteGcpPrefix.mockRejectedValue(new Error(MEDIA_FAILED));
		const alice = await seedUser();
		const before = await rowCounts(alice);

		await expect(
			auth.api.deleteUser({
				body: { password: PASSWORD },
				headers: alice.cookie,
			}),
		).rejects.toThrow(MEDIA_FAILED);

		expect(await rowCounts(alice)).toEqual(before);
		expect(await auth.api.getSession({ headers: alice.cookie })).not.toBeNull();
	});

	it("a user with no password needs a session from the last 24 hours", async () => {
		vi.stubEnv("GCP_BUCKET_NAME", "");
		const alice = await seedUser();
		await db
			.delete(schema.account)
			.where(orm.eq(schema.account.userId, alice.userId));
		await db
			.update(schema.session)
			.set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
			.where(orm.eq(schema.session.userId, alice.userId));

		await expect(
			auth.api.deleteUser({ body: {}, headers: alice.cookie }),
		).rejects.toThrow(/Session expired/);
		expect((await rowCounts(alice)).user).toBe(1);

		await db
			.update(schema.session)
			.set({ createdAt: new Date() })
			.where(orm.eq(schema.session.userId, alice.userId));
		await auth.api.deleteUser({ body: {}, headers: alice.cookie });

		expect(gcp.deleteGcpPrefix).not.toHaveBeenCalled();
		expect((await rowCounts(alice)).user).toBe(0);
	});
});
