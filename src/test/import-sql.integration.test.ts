import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importParentLockSql, importScopeLockSql } from "@/db/import-locks";
import { importUndoSql } from "@/db/import-undo-sql";
import { importCommitSql } from "@/db/import-write-sql";
import {
	ImportAction,
	type ImportCommitPlan,
	ImportKind,
	type ImportPreviewRow,
} from "@/lib/import-batch";
import { buildImportPlan } from "@/lib/import-plan";
import { summarizeImport } from "@/lib/import-reconciliation";
import { parseImportSource, readImportCsv } from "@/lib/import-source";
import {
	adjustmentCsv,
	fixturePool,
	fixtureSchema,
	fixtureUrl,
	runFixtureBatch,
	tradeCsv,
} from "./import-sql-fixture";

describe.skipIf(!fixtureUrl)(
	"atomic import SQL on disposable PostgreSQL",
	() => {
		let pool: Pool;
		beforeAll(async () => {
			pool = fixturePool();
			await pool.query(fixtureSchema);
		});
		afterAll(async () => {
			await pool?.end();
		});
		beforeEach(async () => {
			await pool.query(
				"TRUNCATE review_source_trades,review_source_cash_flows,import_identities,import_batches,trades,cash_flows,portfolios RESTART IDENTITY CASCADE; INSERT INTO portfolios(user_id,currency) VALUES ('fixture-user','USD'),('fixture-user','USD')",
			);
		});
		async function stage(
			kind: ImportKind = ImportKind.Trades,
			account = 1,
			csv = tradeCsv,
		) {
			const source = readImportCsv(csv);
			const rows = await parseImportSource(
				"fixture-user",
				account,
				kind,
				"USD",
				source.rows,
				source.fields,
			);
			const id = crypto.randomUUID();
			await pool.query(
				"INSERT INTO import_batches(id,user_id,portfolio_id,kind,file_name,file_hash,source_currency,rows,summary,expires_at) VALUES ($1,'fixture-user',$2,$3,'fixture.csv','synthetic','USD',$4,$5,NOW()+interval '7 days')",
				[
					id,
					account,
					kind,
					JSON.stringify(rows),
					JSON.stringify(summarizeImport(rows)),
				],
			);
			return { id, rows, account };
		}
		function locks(account = 1) {
			return [
				importScopeLockSql("fixture-user", account),
				importParentLockSql("fixture-user", account, "trades"),
				importParentLockSql("fixture-user", account, "cash_flows"),
			];
		}
		async function apply(
			batch: Awaited<ReturnType<typeof stage>>,
			plan = buildImportPlan(batch.rows, []),
		) {
			return runFixtureBatch(pool, [
				...locks(batch.account),
				importCommitSql(
					"fixture-user",
					batch.account,
					batch.id,
					0,
					"USD",
					plan,
					summarizeImport(batch.rows, plan),
				),
			]);
		}
		async function undo(
			batch: Awaited<ReturnType<typeof stage>>,
			revision = 1,
		) {
			return runFixtureBatch(pool, [
				...locks(batch.account),
				importUndoSql("fixture-user", batch.account, batch.id, revision),
			]);
		}
		it("records signed money, aliases and receipt in one operation", async () => {
			const batch = await stage();
			await apply(batch);
			const { rows } = await pool.query(
				"SELECT net_pnl,fees,broker_commission,broker_swap FROM trades",
			);
			expect(rows[0]).toEqual({
				net_pnl: "51.3",
				fees: "-1.3",
				broker_commission: "-0.7",
				broker_swap: "2",
			});
			expect(
				(await pool.query("SELECT state,outcomes FROM import_batches")).rows[0]
					.outcomes[0],
			).toMatchObject({ recordId: 1, afterRevision: 0, undoState: "pending" });
		});
		it("persists exact expected and actual effects from RETURNING", async () => {
			const batch = await stage(
				ImportKind.Trades,
				1,
				tradeCsv
					.replace("50.00", "0.0001")
					.replace("-0.70", "0.1")
					.replace("2.00", "0.2"),
			);
			await apply(batch);
			const summary = (
				await pool.query("SELECT summary FROM import_batches WHERE id=$1", [
					batch.id,
				])
			).rows[0].summary;
			expect(summary).toMatchObject({
				expectedAccountDelta: "0.3001",
				accountDelta: "0.3001",
				expectedMutations: 1,
				actualMutations: 1,
				accountBefore: "0",
				accountAfter: "0.3001",
				reconciled: true,
			});
		});
		it("a database-suppressed expected mutation cannot become an applied receipt", async () => {
			await pool.query(
				"CREATE FUNCTION skip_fixture_trade() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'; CREATE TRIGGER skip_fixture_trade BEFORE INSERT ON trades FOR EACH ROW EXECUTE FUNCTION skip_fixture_trade()",
			);
			try {
				const batch = await stage();
				await expect(apply(batch)).rejects.toThrow();
				expect(
					(
						await pool.query("SELECT state FROM import_batches WHERE id=$1", [
							batch.id,
						])
					).rows[0].state,
				).toBe("staged");
				expect(
					(await pool.query("SELECT count(*)::int n FROM import_identities"))
						.rows[0].n,
				).toBe(0);
			} finally {
				await pool.query(
					"DROP TRIGGER skip_fixture_trade ON trades; DROP FUNCTION skip_fixture_trade()",
				);
			}
		});
		it("same-account duplicate request cannot insert twice; accounts remain independent", async () => {
			const first = await stage();
			await apply(first);
			const repeated = await stage();
			expect((await apply(repeated))[3].rows).toHaveLength(0);
			const second = await stage(ImportKind.Trades, 2);
			await apply(second);
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(2);
		});
		it("rolls back parent writes, aliases and receipt on a later SQL failure", async () => {
			const batch = await stage();
			const plan = buildImportPlan(batch.rows, []);
			await expect(
				runFixtureBatch(pool, [
					...locks(),
					importCommitSql(
						"fixture-user",
						1,
						batch.id,
						0,
						"USD",
						plan,
						summarizeImport(batch.rows, plan),
					),
					sql`SELECT 1/0`,
				]),
			).rejects.toThrow();
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(0);
			expect(
				(await pool.query("SELECT state FROM import_batches")).rows[0].state,
			).toBe("staged");
		});
		it("stale commit revision gates every dependent mutation", async () => {
			const batch = await stage();
			await pool.query("UPDATE import_batches SET revision=1 WHERE id=$1", [
				batch.id,
			]);
			expect((await apply(batch))[3].rows).toHaveLength(0);
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(0);
		});
		it("selected batch undo leaves the other account and batch intact", async () => {
			const first = await stage();
			await apply(first);
			const second = await stage(ImportKind.Trades, 2);
			await apply(second);
			await undo(first);
			expect(
				(await pool.query("SELECT portfolio_id FROM trades")).rows,
			).toEqual([{ portfolio_id: 2 }]);
			expect(
				(
					await pool.query("SELECT state FROM import_batches WHERE id=$1", [
						first.id,
					])
				).rows[0].state,
			).toBe("undone");
		});
		it.each(["staged", "failed", "undone"])(
			"rejected undo state %s cannot alter parents or aliases",
			async (state) => {
				const batch = await stage();
				await apply(batch);
				await pool.query("UPDATE import_batches SET state=$1 WHERE id=$2", [
					state,
					batch.id,
				]);
				expect((await undo(batch))[3].rows).toHaveLength(0);
				expect(
					(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
				).toBe(1);
				expect(
					(await pool.query("SELECT state FROM import_identities")).rows[0]
						.state,
				).toBe("active");
			},
		);
		it("stale undo revision cannot mutate parents", async () => {
			const batch = await stage();
			await apply(batch);
			expect((await undo(batch, 0))[3].rows).toHaveLength(0);
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(1);
		});
		it.each([
			"edit_revision=edit_revision+1,notes='later note'",
			"edit_revision=edit_revision+1,initial_risk_snapshot='{}'::jsonb",
			"screenshots='[\"fixture-image\"]'::jsonb",
			"annotation_revision=1",
			"reviewed_at=NOW()",
		])("protects later state: %s", async (update) => {
			const batch = await stage();
			await apply(batch);
			await pool.query(`UPDATE trades SET ${update} WHERE id=1`);
			await undo(batch);
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(1);
			expect(
				(await pool.query("SELECT state FROM import_batches")).rows[0].state,
			).toBe("partially-undone");
		});
		it("protects a draft review reference even without a trade revision change", async () => {
			const batch = await stage();
			await apply(batch);
			await pool.query("INSERT INTO review_source_trades(trade_id) VALUES (1)");
			await undo(batch);
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(1);
		});
		it("adjustment batches retain exact signs and review protection", async () => {
			const batch = await stage(ImportKind.Adjustments, 1, adjustmentCsv);
			await apply(batch);
			expect(
				(await pool.query("SELECT amount FROM cash_flows")).rows[0].amount,
			).toBe("-4.5");
			await pool.query(
				"INSERT INTO review_source_cash_flows(cash_flow_id) VALUES (1)",
			);
			await undo(batch);
			expect(
				(await pool.query("SELECT count(*)::int n FROM cash_flows")).rows[0].n,
			).toBe(1);
		});
		it("two concurrent commits serialize and only one wins", async () => {
			const batch = await stage();
			const results = await Promise.all([apply(batch), apply(batch)]);
			expect(results.map((result) => result[3].rows.length).sort()).toEqual([
				0, 1,
			]);
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(1);
		});
		it("a manual edit holding the parent lock wins before undo's fresh eligibility check", async () => {
			const batch = await stage();
			await apply(batch);
			const editor = await pool.connect();
			await editor.query("BEGIN");
			await editor.query(
				"UPDATE trades SET notes='racing note',edit_revision=edit_revision+1 WHERE id=1",
			);
			const pending = undo(batch);
			await editor.query("COMMIT");
			editor.release();
			await pending;
			expect((await pool.query("SELECT notes FROM trades")).rows[0].notes).toBe(
				"racing note",
			);
		});
		it("explicit correction preserves journal/risk/review links; undo can restore only untouched broker fields", async () => {
			const original = await stage();
			await apply(original);
			await pool.query(
				"UPDATE trades SET notes='keep',initial_risk_snapshot='{\"risk\":10}',edit_revision=1",
			);
			const correction = await stage(
				ImportKind.Trades,
				1,
				tradeCsv.replace("50.00", "60.00"),
			);
			const row: ImportPreviewRow = {
				...correction.rows[0],
				action: ImportAction.Ambiguous,
				candidates: [
					{
						id: 1,
						revision: 1,
						reason: "candidate",
						snapshot: buildImportPlan(original.rows, [])[0]
							.after as NonNullable<ImportCommitPlan["after"]>,
					},
				],
			};
			const plan = buildImportPlan(
				[row],
				[
					{
						rowNumber: 2,
						action: ImportAction.Correct,
						targetId: 1,
						expectedRevision: 1,
					},
				],
			);
			await apply(correction, plan);
			expect(
				(
					await pool.query(
						"SELECT net_pnl,notes,initial_risk_snapshot,edit_revision FROM trades",
					)
				).rows[0],
			).toEqual({
				net_pnl: "61.3",
				notes: "keep",
				initial_risk_snapshot: { risk: 10 },
				edit_revision: 2,
			});
			await undo(correction);
			expect(
				(await pool.query("SELECT net_pnl,notes,edit_revision FROM trades"))
					.rows[0],
			).toEqual({ net_pnl: "51.3", notes: "keep", edit_revision: 3 });
		});
		it("preserves reported open money without realizing it in account effects", async () => {
			const batch = await stage(
				ImportKind.Trades,
				1,
				tradeCsv.replace("2026-09-01 10:00:00", "").replace("1.1050", ""),
			);
			await apply(batch);
			const receipt = (await pool.query("SELECT summary FROM import_batches"))
				.rows[0].summary;
			expect(receipt).toMatchObject({
				openRows: 1,
				openNet: "51.3",
				accountDelta: "0",
				accountBefore: "0",
				accountAfter: "0",
				actualMutations: 1,
				reconciled: true,
			});
			expect(
				(await pool.query("SELECT net_pnl FROM trades")).rows[0].net_pnl,
			).toBe("51.3");
		});
		it("uses the application's default currency for a legacy account without currency", async () => {
			await pool.query("UPDATE portfolios SET currency=NULL WHERE id=1");
			const batch = await stage();
			await apply(batch);
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(1);
		});
		it("rejects another owner's batch without record, receipt or alias writes", async () => {
			const batch = await stage();
			const plan = buildImportPlan(batch.rows, []);
			const results = await runFixtureBatch(pool, [
				importScopeLockSql("other-user", 1),
				importCommitSql(
					"other-user",
					1,
					batch.id,
					0,
					"USD",
					plan,
					summarizeImport(batch.rows, plan),
				),
			]);
			expect(results.at(-1)?.rowCount).toBe(0);
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(0);
			expect(
				(await pool.query("SELECT count(*)::int n FROM import_identities"))
					.rows[0].n,
			).toBe(0);
			expect(
				(await pool.query("SELECT state FROM import_batches")).rows[0].state,
			).toBe("staged");
		});
		it("review membership racing undo acquires the same parent first and protects it", async () => {
			const batch = await stage();
			await apply(batch);
			const reviewer = await pool.connect();
			await reviewer.query("BEGIN");
			const dialect = new PgDialect();
			const lock = dialect.sqlToQuery(
				importParentLockSql("fixture-user", 1, "trades"),
			);
			await reviewer.query(lock.sql, lock.params);
			await reviewer.query(
				"INSERT INTO review_source_trades(trade_id) VALUES (1)",
			);
			const pending = undo(batch);
			await reviewer.query("COMMIT");
			reviewer.release();
			await pending;
			expect(
				(await pool.query("SELECT count(*)::int n FROM trades")).rows[0].n,
			).toBe(1);
		});
	},
);
