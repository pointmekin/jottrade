import type { Pool } from "pg";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	getOnboarding,
	setOnboardingDismissed,
	setupFirstAccount,
} from "@/server/onboardingActions";

const state = vi.hoisted(() => ({
	userId: "u1" as string | null,
	pool: undefined as unknown,
}));
vi.mock("@/db", async () => {
	const { drizzle: connect } = await import("drizzle-orm/node-postgres");
	const schema = await import("@/db/schema");
	const { Pool: PgPool } = await import("pg");
	// One connection, so the temporary tables below stay visible to every query.
	const pool = new PgPool({
		connectionString: process.env.ONBOARDING_TEST_DATABASE_URL,
		max: 1,
	});
	state.pool = pool;
	return { db: connect(pool, { schema }) };
});
vi.mock("@/lib/auth", () => ({
	requireUserId: async () => {
		if (!state.userId) throw new Error("Unauthorized");
		return state.userId;
	},
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));

const connectionString = process.env.ONBOARDING_TEST_DATABASE_URL;
const account = {
	name: "Exness Standard",
	broker: "Exness",
	currency: "EUR",
	timezone: "Asia/Bangkok",
} as const;

const TEMP_SCHEMA = `
create temp table "user"(id text primary key);
create temp table portfolios(id serial primary key,user_id text not null references "user" on delete cascade,name text not null,description text,review_timezone text,review_week_starts_on integer default 1 not null,kind text default 'REAL' not null,currency text default 'USD',is_default boolean default false,created_at timestamp default now());
create unique index on portfolios(user_id) where is_default;
create temp table trades(id serial primary key,user_id text not null);
create temp table cash_flows(id serial primary key,user_id text not null,kind text not null);
create temp table review_periods(id serial primary key,user_id text not null,kind text not null,status text not null);
create temp table user_onboarding(user_id text primary key references "user" on delete cascade,dismissed_at timestamptz);
insert into "user" values ('u1'),('u2');
`;

describe.skipIf(!connectionString)(
	"onboarding server functions on local PostgreSQL",
	() => {
		beforeAll(async () => {
			const url = new URL(connectionString ?? "");
			if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
				throw new Error("Run onboarding DB tests on a local database only.");
			}
			await (state.pool as Pool).query(TEMP_SCHEMA);
		});
		afterAll(async () => {
			await (state.pool as Pool).end();
		});
		beforeEach(async () => {
			state.userId = "u1";
			await (state.pool as Pool).query(
				"truncate portfolios, trades, cash_flows, review_periods, user_onboarding restart identity",
			);
		});
		const sql = (text: string) => (state.pool as Pool).query(text);

		it("reports an empty workspace for a new user", async () => {
			const result = await getOnboarding();

			expect(result.isDismissed).toBe(false);
			expect(result.facts).toEqual({
				isAccountConfigured: false,
				hasFunding: false,
				hasTrades: false,
				hasCompletedReview: false,
			});
		});

		it("derives each fact from real rows and ignores other users", async () => {
			await sql(`
				insert into cash_flows(user_id,kind) values ('u1','DEPOSIT'),('u2','DEPOSIT');
				insert into review_periods(user_id,kind,status) values ('u1','DAILY','DRAFT'),('u1','WEEKLY','COMPLETE');
				insert into trades(user_id) values ('u2');
			`);

			const result = await getOnboarding();

			expect(result.facts.hasFunding).toBe(true);
			expect(result.facts.hasTrades).toBe(false);
			expect(result.facts.hasCompletedReview).toBe(false);

			await sql(
				"insert into review_periods(user_id,kind,status) values ('u1','DAILY','COMPLETE')",
			);
			expect((await getOnboarding()).facts.hasCompletedReview).toBe(true);
		});

		it("counts a withdrawal as no opening funds", async () => {
			await sql(
				"insert into cash_flows(user_id,kind) values ('u1','WITHDRAWAL')",
			);

			expect((await getOnboarding()).facts.hasFunding).toBe(false);
		});

		it("treats a user with a trade as configured", async () => {
			await sql("insert into trades(user_id) values ('u1')");

			expect((await getOnboarding()).facts.isAccountConfigured).toBe(true);
		});

		it("stores and clears the dismissal for the caller only", async () => {
			await setOnboardingDismissed({ data: { isDismissed: true } });
			expect((await getOnboarding()).isDismissed).toBe(true);

			state.userId = "u2";
			expect((await getOnboarding()).isDismissed).toBe(false);

			state.userId = "u1";
			await setOnboardingDismissed({ data: { isDismissed: false } });
			expect((await getOnboarding()).isDismissed).toBe(false);
		});

		it("creates the first account as the default without a prior read", async () => {
			await setupFirstAccount({ data: account });

			const { rows } = await sql(
				"select name,description,currency,review_timezone,is_default from portfolios where user_id='u1'",
			);
			expect(rows).toEqual([
				{
					name: "Exness Standard",
					description: "Exness",
					currency: "EUR",
					review_timezone: "Asia/Bangkok",
					is_default: true,
				},
			]);
			expect((await getOnboarding()).facts.isAccountConfigured).toBe(true);
		});

		it("finishes setup of an existing default account instead of adding one", async () => {
			await sql(
				"insert into portfolios(user_id,name,is_default) values ('u1','Main account',true)",
			);

			await setupFirstAccount({ data: account });

			const { rows } = await sql(
				"select name from portfolios where user_id='u1'",
			);
			expect(rows).toEqual([{ name: "Exness Standard" }]);
		});

		it("never touches another user's account", async () => {
			await sql(
				"insert into portfolios(user_id,name,is_default) values ('u2','Theirs',true)",
			);

			await setupFirstAccount({ data: account });

			const { rows } = await sql(
				"select user_id,name from portfolios order by user_id",
			);
			expect(rows).toEqual([
				{ user_id: "u1", name: "Exness Standard" },
				{ user_id: "u2", name: "Theirs" },
			]);
		});

		it("updates the account named by accountId, not the default", async () => {
			await sql(
				"insert into portfolios(user_id,name,is_default) values ('u1','Main',true),('u1','Demo',false)",
			);

			await setupFirstAccount({ data: { ...account, accountId: 2 } });

			const { rows } = await sql(
				"select name from portfolios where user_id='u1' order by id",
			);
			expect(rows).toEqual([{ name: "Main" }, { name: "Exness Standard" }]);
		});

		it("rejects an accountId that belongs to another user", async () => {
			await sql(
				"insert into portfolios(user_id,name,is_default) values ('u2','Theirs',true)",
			);

			await expect(
				setupFirstAccount({ data: { ...account, accountId: 1 } }),
			).rejects.toThrow("Account not found.");
			const { rows } = await sql("select name from portfolios");
			expect(rows).toEqual([{ name: "Theirs" }]);
		});

		it("rejects an unauthenticated caller", async () => {
			state.userId = null;

			await expect(getOnboarding()).rejects.toThrow("Unauthorized");
			await expect(
				setOnboardingDismissed({ data: { isDismissed: true } }),
			).rejects.toThrow("Unauthorized");
			await expect(setupFirstAccount({ data: account })).rejects.toThrow(
				"Unauthorized",
			);
		});

		it("rejects invalid input before it writes", async () => {
			await expect(
				setupFirstAccount({ data: { ...account, timezone: "Mars/Olympus" } }),
			).rejects.toThrow();
			await expect(
				setOnboardingDismissed({ data: { isDismissed: "yes" } as never }),
			).rejects.toThrow();

			const { rows } = await sql("select id from portfolios");
			expect(rows).toHaveLength(0);
		});
	},
);
