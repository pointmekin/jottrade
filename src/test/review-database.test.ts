import type { NeonQueryFunction } from "@neondatabase/serverless";
import { Pool, type PoolClient, type QueryResult, types } from "pg";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { EMPTY_REVIEW_FIELDS, ReviewKind } from "@/lib/review";
import { deleteAccount } from "@/server/portfolioActions";
import {
	getReviewPeriod,
	reopenReviewPeriod,
	saveReviewPeriod,
} from "@/server/reviewActions";
import { getReviewQueue } from "@/server/reviewQueueActions";
import {
	getTradeReviewAnnotation,
	saveTradeReviewAnnotation,
} from "@/server/tradeReviewActions";
import { REVIEW_TEST_SCHEMA } from "./review-database-fixture";

const transport = vi.hoisted(() => ({
	query: vi.fn(),
	transaction: vi.fn(),
	userId: "u1",
}));
vi.mock("@/db", async () => {
	const { drizzle } = await import("drizzle-orm/neon-http");
	const schema = await import("@/db/schema");
	type Client = NeonQueryFunction<false, false>;
	return { db: drizzle(transport as unknown as Client, { schema }) };
});
vi.mock("@/lib/auth", () => ({
	requireUserId: async () => {
		if (!transport.userId) throw new Error("Unauthorized");
		return transport.userId;
	},
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		let schema: { parse: (data: unknown) => unknown };
		const builder = {
			validator: (value: typeof schema) => {
				schema = value;
				return builder;
			},
			handler:
				(handler: (context: { data: unknown }) => unknown) =>
				(context: { data: unknown }) =>
					handler({ data: schema.parse(context.data) }),
		};
		return builder;
	},
}));
const connectionString = process.env.REVIEW_TEST_DATABASE_URL;
const scope = { portfolioId: 1, kind: ReviewKind.Daily, start: "2026-10-02" };
const save = (expectedRevision: number, complete = false, notes = "daily") =>
	saveReviewPeriod({
		data: {
			...scope,
			expectedRevision,
			complete,
			fields: { ...EMPTY_REVIEW_FIELDS, notes },
		},
	});
let pool: Pool;
type Request = { execute: (client: Pool | PoolClient) => Promise<QueryResult> };
describe.skipIf(!connectionString)(
	"review SQL on disposable PostgreSQL with Neon batch transport",
	() => {
		beforeAll(async () => {
			const url = new URL(connectionString ?? "");
			if (
				url.hostname !== "127.0.0.1" ||
				!(
					(url.port === "55411" && url.pathname === "/review_test") ||
					(url.port === "49485" && url.pathname === "/issue11_sql")
				)
			)
				throw new Error(
					"Only an explicitly assigned disposable review database is allowed.",
				);
			pool = new Pool({ connectionString });
			transport.query.mockImplementation(
				(text: string, values: unknown[], options: { arrayMode?: boolean }) => {
					const rawTypes = {
						getTypeParser: (oid: number) =>
							[1082, 1114, 1184].includes(oid)
								? (value: string) => value
								: types.getTypeParser(oid),
					};
					const execute = (client: Pool | PoolClient): Promise<QueryResult> =>
						options?.arrayMode
							? client.query({
									text,
									values,
									rowMode: "array",
									types: rawTypes,
								})
							: client.query({ text, values, types: rawTypes });
					return {
						execute,
						// biome-ignore lint/suspicious/noThenProperty: Neon query promises use a lazy thenable protocol, which this fixture implements.
						then: (
							resolve: (value: QueryResult) => unknown,
							reject: (error: unknown) => unknown,
						) => execute(pool).then(resolve, reject),
					};
				},
			);
			transport.transaction.mockImplementation(async (requests: Request[]) => {
				const client = await pool.connect();
				await client.query("begin");
				try {
					const results: QueryResult[] = [];
					for (const request of requests)
						results.push(await request.execute(client));
					await client.query("commit");
					return results;
				} catch (error) {
					await client.query("rollback");
					throw error;
				} finally {
					client.release();
				}
			});
		});
		beforeEach(async () => {
			transport.userId = "u1";
			await pool.query("drop schema public cascade; create schema public;");
			await pool.query(REVIEW_TEST_SCHEMA);
			await pool.query(
				`insert into "user" values('u1'),('u2');insert into portfolios(id,user_id,name,review_timezone) values(1,'u1','A','Asia/Bangkok'),(2,'u1','B','UTC'),(3,'u2','Other','UTC');`,
			);
		});
		afterAll(async () => {
			await pool?.end();
		});
		it("saves no-trade day notes and completes independently", async () => {
			expect((await save(0)).revision).toBe(1);
			await save(1, true);
			const review = await getReviewPeriod({ data: scope });
			expect(review.fields.notes).toBe("daily");
			expect(review.period?.status).toBe("COMPLETE");
			expect(review.sources.trades).toHaveLength(0);
			expect(review.period?.resultSnapshot?.winRate).toBeNull();
		});
		it("captures 75 trades, adjustments and funding and preserves completed facts on correction", async () => {
			await pool.query(
				`insert into trades(portfolio_id,user_id,symbol,side,status,entry_date,exit_date,net_pnl) select 1,'u1','EURUSD','LONG','CLOSED','2026-10-01','2026-10-02',2 from generate_series(1,75);insert into cash_flows(user_id,portfolio_id,occurred_at,amount,kind) values('u1',1,'2026-10-02',-3,'ADJUSTMENT'),('u1',1,'2026-10-02',1000,'DEPOSIT');`,
			);
			await save(0, true);
			const frozen = await getReviewPeriod({ data: scope });
			expect(frozen.tradeLinks).toHaveLength(75);
			expect(frozen.flowLinks).toHaveLength(2);
			expect(frozen.period?.resultSnapshot).toMatchObject({
				tradingPnl: "147",
				netDeposits: "1000",
			});
			await pool.query(
				"update trades set net_pnl=9 where id=1;update cash_flows set amount=-5 where id=1",
			);
			const corrected = await getReviewPeriod({ data: scope });
			expect(corrected.period?.resultSnapshot?.tradingPnl).toBe("147");
			expect(corrected.sources.results.tradingPnl).toBe("152");
			expect(corrected.tradeLinks[0].snapshot.netPnl).toBe("2");
		});
		it("protects draft and reopened trade and cash-flow links from deletion", async () => {
			await pool.query(
				`insert into trades(portfolio_id,user_id,symbol,side,entry_date) values(1,'u1','EURUSD','LONG','2026-10-02');insert into cash_flows(user_id,portfolio_id,occurred_at,amount,kind) values('u1',1,'2026-10-02',1,'ADJUSTMENT')`,
			);
			await save(0);
			await expect(pool.query("delete from trades where id=1")).rejects.toThrow(
				/foreign key/,
			);
			await expect(
				pool.query("delete from cash_flows where id=1"),
			).rejects.toThrow(/foreign key/);
			await save(1, true);
			const review = await getReviewPeriod({ data: scope });
			await reopenReviewPeriod({
				data: {
					portfolioId: 1,
					id: review.period?.id ?? 0,
					expectedRevision: 2,
				},
			});
			await expect(pool.query("delete from trades where id=1")).rejects.toThrow(
				/foreign key/,
			);
		});
		it("gates zero-row CAS and concurrent creation without orphan effects", async () => {
			await save(0);
			await expect(save(0, true, "stale")).rejects.toThrow(/changed/);
			expect((await getReviewPeriod({ data: scope })).fields.notes).toBe(
				"daily",
			);
			const next = { ...scope, start: "2026-10-03" };
			const results = await Promise.allSettled([
				saveReviewPeriod({
					data: {
						...next,
						expectedRevision: 0,
						complete: false,
						fields: EMPTY_REVIEW_FIELDS,
					},
				}),
				saveReviewPeriod({
					data: {
						...next,
						expectedRevision: 0,
						complete: false,
						fields: EMPTY_REVIEW_FIELDS,
					},
				}),
			]);
			expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		});
		it("rejects a source insertion or correction between prefetch and completion without link effects", async () => {
			await pool.query(
				`insert into trades(portfolio_id,user_id,symbol,side,status,entry_date,exit_date,net_pnl,entry_price,exit_price,fees) values(1,'u1','EURUSD','LONG','CLOSED','2026-10-02','2026-10-02',2,1.1,1.2,0.01)`,
			);
			await save(0);
			const batch = transport.transaction.getMockImplementation();
			transport.transaction.mockImplementationOnce(
				async (requests: Request[]) => {
					await pool.query(
						`insert into cash_flows(user_id,portfolio_id,occurred_at,amount,kind) values('u1',1,'2026-10-02',0.01,'ADJUSTMENT')`,
					);
					return batch?.(requests);
				},
			);
			await expect(save(1, true)).rejects.toThrow(/changed/);
			expect(
				(await pool.query("select count(*) from review_source_cash_flows"))
					.rows[0].count,
			).toBe("0");
			transport.transaction.mockImplementationOnce(
				async (requests: Request[]) => {
					await pool.query(
						"update trades set net_pnl=3,edit_revision=edit_revision+1 where id=1",
					);
					return batch?.(requests);
				},
			);
			await expect(save(1, true)).rejects.toThrow(/changed/);
			const stale = await getReviewPeriod({ data: scope });
			expect(stale.revision).toBe(1);
			expect(stale.period?.resultSnapshot).toBeNull();
			expect(stale.tradeLinks[0].snapshot.netPnl).toBe("2");
			await save(1, true);
			const complete = await getReviewPeriod({ data: scope });
			expect(complete.period?.resultSnapshot?.tradingPnl).toBe("3.01");
			expect(
				complete.tradeLinks[0].snapshot.executionFacts.execution,
			).toMatchObject({ entryPrice: "1.1", exitPrice: "1.2", fees: "0.01" });
		});
		it("annotations use CAS and preserve reported P&L, with financial re-review", async () => {
			await pool.query(
				`insert into trades(portfolio_id,user_id,symbol,side,status,entry_date,net_pnl,notes,import_hash) values(1,'u1','EURUSD','LONG','CLOSED','2026-10-02',123,'broker','import')`,
			);
			const initial = await getTradeReviewAnnotation({
				data: { portfolioId: 1, id: 1 },
			});
			await saveTradeReviewAnnotation({
				data: {
					portfolioId: 1,
					id: 1,
					notes: "lesson",
					expectedRevision: 0,
					review: "COMPLETE",
					expectedFingerprint: initial.fingerprint,
				},
			});
			await expect(
				saveTradeReviewAnnotation({
					data: {
						portfolioId: 1,
						id: 1,
						notes: "stale",
						expectedRevision: 0,
						review: "KEEP",
					},
				}),
			).rejects.toThrow(/changed/);
			expect(
				(
					await pool.query(
						"select net_pnl,edit_revision,annotation_revision from trades",
					)
				).rows[0],
			).toEqual({ net_pnl: "123", edit_revision: 1, annotation_revision: 1 });
			expect(
				(
					await getReviewQueue({
						data: { portfolioId: 1, openTrades: false, page: 1 },
					})
				).total,
			).toBe(0);
			await pool.query(
				"update trades set net_pnl=124,edit_revision=edit_revision+1 where id=1",
			);
			expect(
				(
					await getReviewQueue({
						data: { portfolioId: 1, openTrades: false, page: 1 },
					})
				).total,
			).toBe(1);
		});
		it("rejects foreign users/accounts and unauthenticated access", async () => {
			await expect(
				getReviewPeriod({ data: { ...scope, portfolioId: 3 } }),
			).rejects.toThrow(/Account not found/);
			transport.userId = "u2";
			await expect(save(0)).rejects.toThrow(/Account not found/);
			transport.userId = "";
			await expect(getReviewPeriod({ data: scope })).rejects.toThrow(
				/Unauthorized/,
			);
		});
		it("retains prior historical weekly commitment and period preferences", async () => {
			const weekly = {
				portfolioId: 1,
				kind: ReviewKind.Weekly,
				start: "2026-09-21",
			};
			await saveReviewPeriod({
				data: {
					...weekly,
					expectedRevision: 0,
					complete: true,
					fields: {
						...EMPTY_REVIEW_FIELDS,
						nextAction: "Wait for confirmation",
					},
				},
			});
			const next = { ...weekly, start: "2026-10-05" };
			await saveReviewPeriod({
				data: {
					...next,
					expectedRevision: 0,
					complete: false,
					fields: EMPTY_REVIEW_FIELDS,
				},
			});
			await pool.query(
				"update portfolios set review_timezone='America/New_York',review_week_starts_on=0,currency='THB' where id=1",
			);
			const review = await getReviewPeriod({ data: next });
			expect(review.previousCommitment).toBe("Wait for confirmation");
			expect(review.window.timezoneSnapshot).toBe("Asia/Bangkok");
			expect(review.window.periodStart).toBe("2026-10-05");
			expect(review.weekStartsOn).toBe(1);
			expect(review.currency).toBe("USD");
			expect(review.liveCurrency).toBe("THB");
			await expect(
				saveReviewPeriod({
					data: {
						...next,
						expectedRevision: 1,
						complete: true,
						fields: EMPTY_REVIEW_FIELDS,
					},
				}),
			).rejects.toThrow(/currency/);
			expect((await getReviewPeriod({ data: next })).currency).toBe("USD");
		});
		it("account deletion cascades review links before removing source parents", async () => {
			await pool.query(
				`insert into trades(portfolio_id,user_id,symbol,side,entry_date) values(1,'u1','EURUSD','LONG','2026-10-02')`,
			);
			await save(0, true);
			await deleteAccount({ data: { id: 1, confirmName: "A" } });
			expect(
				(await pool.query("select count(*) from review_periods")).rows[0].count,
			).toBe("0");
			expect(
				(await pool.query("select count(*) from review_source_trades")).rows[0]
					.count,
			).toBe("0");
		});
	},
);
