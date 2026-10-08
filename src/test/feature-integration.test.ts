import type { NeonQueryFunction } from "@neondatabase/serverless";
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
import { ImportAction, ImportKind } from "@/lib/import-batch";
import { EMPTY_REVIEW_FIELDS, ReviewKind } from "@/lib/review";
import { TradeSide } from "@/lib/trade";
import { saveTradeImage } from "@/server/imageActions";
import {
	commitImport,
	stageImport,
	undoImportBatch,
} from "@/server/importActions";
import {
	getReviewPeriod,
	reopenReviewPeriod,
	saveReviewPeriod,
} from "@/server/reviewActions";
import { deleteTrade, updateTrade } from "@/server/tradeActions";
import {
	getTradeReviewAnnotation,
	saveTradeReviewAnnotation,
} from "@/server/tradeReviewActions";
import { correctTradeInitialRisk } from "@/server/tradeRiskActions";
import {
	integrationPool,
	integrationUrl,
	resetIntegrationDatabase,
} from "./feature-integration-fixture";
import { adjustmentCsv, tradeCsv } from "./import-sql-fixture";

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
vi.mock("@/lib/gcp", () => ({
	publicObjectUrl: (name: string) => `https://fixture.invalid/${name}`,
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
const scope = { portfolioId: 1, kind: ReviewKind.Daily, start: "2026-09-01" };
const saveReview = (expectedRevision: number, complete = false) =>
	saveReviewPeriod({
		data: { ...scope, expectedRevision, complete, fields: EMPTY_REVIEW_FIELDS },
	});
const stage = (csv = tradeCsv, kind: ImportKind = ImportKind.Trades) =>
	stageImport({
		data: {
			portfolioId: 1,
			kind,
			csv,
			fileName: "synthetic.csv",
			sourceCurrency: "USD",
		},
	});
const importTrade = async () => {
	const batch = await stage();
	return commitImport({
		data: { batchId: batch.id, revision: batch.revision, decisions: [] },
	});
};
const riskData = (id: number, expectedRevision: number) => ({
	id,
	expectedRevision,
	reason: "Original plan supplied from synthetic journal",
	symbol: "EURUSD",
	side: TradeSide.Long,
	entryDate: "2026-09-01T08:00:00Z",
	entryPrice: "1.1",
	quantity: "0.1",
	initialStopPrice: "1.095",
	targetPrice: "1.11",
	balanceAccount: "10000",
	correctExecutionInputs: false,
});

describe.skipIf(!integrationUrl)(
	"risk, import and review contracts on migrated PostgreSQL",
	() => {
		let pool: Pool;
		beforeAll(() => {
			pool = integrationPool(transport);
		});
		beforeEach(async () => {
			transport.userId = "fixture-user";
			await resetIntegrationDatabase(pool);
		});
		afterAll(async () => {
			await pool?.end();
		});
		async function trade() {
			return (await pool.query("select * from trades order by id limit 1"))
				.rows[0];
		}
		async function correctBroker(id: number, expectedRevision: number) {
			const batch = await stage(tradeCsv.replace("50.00", "60.00"));
			return commitImport({
				data: {
					batchId: batch.id,
					revision: batch.revision,
					decisions: [
						{
							rowNumber: 2,
							action: ImportAction.Correct,
							targetId: id,
							expectedRevision,
						},
					],
				},
			});
		}
		it("imports unknown risk, then preserves attested risk and notes through broker correction", async () => {
			await importTrade();
			let row = await trade();
			expect(row.initial_risk_amount).toBeNull();
			expect(row.initial_risk_snapshot).toBeNull();
			await correctTradeInitialRisk({ data: riskData(row.id, 0) });
			const initial = await getTradeReviewAnnotation({
				data: { portfolioId: 1, id: row.id },
			});
			await saveTradeReviewAnnotation({
				data: {
					portfolioId: 1,
					id: row.id,
					expectedRevision: 0,
					notes: "Keep this lesson",
					review: "COMPLETE",
					expectedFingerprint: initial.fingerprint,
				},
			});
			row = await trade();
			const risk = row.initial_risk_snapshot;
			expect(row.net_pnl).toBe("51.3");
			expect(
				(
					await getTradeReviewAnnotation({
						data: { portfolioId: 1, id: row.id },
					})
				).reviewed,
			).toBe(true);
			await correctBroker(row.id, row.edit_revision);
			row = await trade();
			expect(row.net_pnl).toBe("61.3");
			expect(row.initial_risk_snapshot).toEqual(risk);
			expect(row.notes).toBe("Keep this lesson");
			expect(row.annotation_revision).toBe(1);
			expect(
				(
					await getTradeReviewAnnotation({
						data: { portfolioId: 1, id: row.id },
					})
				).reviewed,
			).toBe(false);
		});
		it("requires a client baseline for generic notes and rejects stale annotations", async () => {
			await importTrade();
			const row = await trade();
			await expect(
				updateTrade({ data: { id: row.id, notes: "unsafe" } }),
			).rejects.toThrow(/baseline/);
			await updateTrade({
				data: { id: row.id, notes: "fresh", expectedAnnotationRevision: 0 },
			});
			await expect(
				updateTrade({
					data: { id: row.id, notes: "stale", expectedAnnotationRevision: 0 },
				}),
			).rejects.toThrow(/changed/);
			expect(await trade()).toMatchObject({
				notes: "fresh",
				net_pnl: "51.3",
				annotation_revision: 1,
				edit_revision: 1,
			});
		});
		it("retains later risk, note and screenshot edits during undo", async () => {
			const first = await importTrade();
			let row = await trade();
			await correctTradeInitialRisk({ data: riskData(row.id, 0) });
			await saveTradeReviewAnnotation({
				data: {
					portfolioId: 1,
					id: row.id,
					expectedRevision: 0,
					notes: "lesson",
					review: "KEEP",
				},
			});
			await saveTradeImage({
				data: {
					tradeId: row.id,
					url: `https://fixture.invalid/trades/fixture-user/${row.id}/chart.png`,
				},
			});
			const undone = await undoImportBatch({ data: { batchId: first.id } });
			expect(undone.state).toBe("partially-undone");
			expect(undone.outcomes[0].undoState).toBe("protected");
			row = await trade();
			expect(row.notes).toBe("lesson");
			expect(Number(row.initial_risk_amount)).toBeCloseTo(50);
			expect(row.screenshots).toHaveLength(1);
		});
		it("freezes full source facts and results while live corrections remain visible", async () => {
			await importTrade();
			const row = await trade();
			await correctTradeInitialRisk({ data: riskData(row.id, 0) });
			const adjustment = await stage(adjustmentCsv, ImportKind.Adjustments);
			await commitImport({
				data: { batchId: adjustment.id, revision: 0, decisions: [] },
			});
			await saveReview(0, true);
			const frozen = await getReviewPeriod({ data: scope });
			expect(frozen.period?.resultSnapshot?.tradingPnl).toBe("46.8");
			expect(frozen.tradeLinks[0].snapshot.executionFacts.risk).toMatchObject({
				stopPrice: "1.095",
				accountCurrency: "USD",
			});
			expect(frozen.flowLinks[0].snapshot.brokerFacts).toMatchObject({
				amountDecimal: "-4.5",
			});
			const correction = await correctBroker(row.id, 1);
			const changed = await getReviewPeriod({ data: scope });
			expect(changed.period?.resultSnapshot?.tradingPnl).toBe("46.8");
			expect(changed.sources.results.tradingPnl).toBe("56.8");
			expect(changed.tradeLinks[0].snapshot.netPnl).toBe("51.3");
			expect(changed.importChanges).toContainEqual(
				expect.objectContaining({
					batchId: correction.id,
					recordId: row.id,
					action: ImportAction.Correct,
				}),
			);
		});
		it("protects draft, reopened, moved and excluded sources from undo and manual deletion", async () => {
			const batch = await importTrade();
			const row = await trade();
			const adjustment = await stage(adjustmentCsv, ImportKind.Adjustments);
			await commitImport({
				data: { batchId: adjustment.id, revision: 0, decisions: [] },
			});
			await saveReview(0);
			await expect(deleteTrade({ data: { id: row.id } })).rejects.toThrow(
				/review/,
			);
			expect(
				(await undoImportBatch({ data: { batchId: batch.id } })).state,
			).toBe("partially-undone");
			expect(
				(await undoImportBatch({ data: { batchId: adjustment.id } })).state,
			).toBe("partially-undone");
			await saveReview(1, true);
			const review = await getReviewPeriod({ data: scope });
			await reopenReviewPeriod({
				data: {
					portfolioId: 1,
					id: review.period?.id ?? 0,
					expectedRevision: 2,
				},
			});
			await pool.query(
				"update trades set exit_date='2026-09-02',edit_revision=edit_revision+1 where id=$1",
				[row.id],
			);
			await saveReview(3, true);
			expect(
				(await getReviewPeriod({ data: scope })).tradeLinks[0]
					.includedInSnapshot,
			).toBe(false);
			await expect(
				pool.query("delete from trades where id=$1", [row.id]),
			).rejects.toThrow(/foreign key/);
			expect(
				(await undoImportBatch({ data: { batchId: batch.id } })).state,
			).toBe("partially-undone");
		});
		it("restores eligible broker corrections without replacing earlier original risk", async () => {
			await importTrade();
			let row = await trade();
			await correctTradeInitialRisk({ data: riskData(row.id, 0) });
			const risk = (await trade()).initial_risk_snapshot;
			const correction = await correctBroker(row.id, 1);
			expect(
				(await undoImportBatch({ data: { batchId: correction.id } })).state,
			).toBe("undone");
			row = await trade();
			expect(row.net_pnl).toBe("51.3");
			expect(row.initial_risk_snapshot).toEqual(risk);
		});
		it("serializes review membership versus undo without dangling or deleted linked sources", async () => {
			const batch = await importTrade();
			const [reviewResult] = await Promise.allSettled([
				saveReview(0),
				undoImportBatch({ data: { batchId: batch.id } }),
			]);
			const links = (await pool.query("select * from review_source_trades"))
				.rows;
			const rows = (await pool.query("select * from trades")).rows;
			if (reviewResult.status === "fulfilled") {
				expect(links).toHaveLength(1);
				expect(rows).toHaveLength(1);
			} else {
				expect(links).toHaveLength(0);
			}
		});
		it("isolates accounts and rejects foreign-user risk, import and review writes", async () => {
			await importTrade();
			const row = await trade();
			transport.userId = "other-user";
			await expect(
				correctTradeInitialRisk({ data: riskData(row.id, 0) }),
			).rejects.toThrow(/not found/);
			await expect(stage()).rejects.toThrow(/Account/);
			await expect(saveReview(0)).rejects.toThrow(/Account/);
			expect(await trade()).toMatchObject({
				edit_revision: 0,
				initial_risk_snapshot: null,
			});
		});
	},
);
