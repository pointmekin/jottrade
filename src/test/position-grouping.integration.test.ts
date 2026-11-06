import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ImportAction, ImportKind } from "@/lib/import-batch";
import { parseImportSource, readImportCsv } from "@/lib/import-source";
import { ExecutionKind } from "@/lib/position";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { checkTarget } from "../../scripts/db/target";

// Runs in `npm run verify` on the seeded database, as positions.integration.test.ts.
const verifyUrl = process.env.VERIFY_DATABASE_URL;

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
	requireUserId: async () => {
		if (!session.userId) throw new Error("Unauthorized");
		return session.userId;
	},
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));

// Seed facts from scripts/db/seed-accounts.ts.
const ALICE = "seed-alice";
const BOB = "seed-bob";
const ALICE_ACCOUNT = 1;
const BOB_ACCOUNT = 4;

const at = (day: number, hour: number) =>
	new Date(Date.UTC(2026, 6, day, hour));

describe.skipIf(!verifyUrl)(
	"broker row grouping on the seeded database",
	() => {
		let positions: typeof import("@/server/positionActions");
		let trades: typeof import("@/server/tradeActions");
		let calendar: typeof import("@/server/calendarActions");
		let history: typeof import("@/db/account-history");
		let db: typeof import("@/db").db;
		let schema: typeof import("@/db/schema");
		let orm: typeof import("drizzle-orm");
		const created: number[] = [];
		const batches: string[] = [];

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
			positions = await import("@/server/positionActions");
			trades = await import("@/server/tradeActions");
			calendar = await import("@/server/calendarActions");
			history = await import("@/db/account-history");
		});

		// The browser suite runs next on the same database and reads these accounts.
		afterAll(async () => {
			session.userId = "";
			if (batches.length) {
				await db
					.delete(schema.importIdentities)
					.where(orm.inArray(schema.importIdentities.batchId, batches));
				await db
					.delete(schema.importBatches)
					.where(orm.inArray(schema.importBatches.id, batches));
			}
			if (!created.length) return;
			await db
				.update(schema.trades)
				.set({ groupedIntoId: null })
				.where(orm.inArray(schema.trades.groupedIntoId, created));
			await db
				.delete(schema.trades)
				.where(orm.inArray(schema.trades.id, created));
		});

		async function brokerLegs(day: number) {
			const base = {
				userId: ALICE,
				portfolioId: ALICE_ACCOUNT,
				symbol: "EURUSD",
				side: TradeSide.Long,
				status: TradeStatus.Closed,
				entryDate: at(day, 8),
				entryPrice: "1.1000",
				brokerSource: "exness",
			};
			const rows = await db
				.insert(schema.trades)
				.values([
					{
						...base,
						quantity: "0.10",
						exitDate: at(day, 10),
						exitPrice: "1.1050",
						fees: "0.70",
						netPnl: "51.30",
						brokerTicket: "9101",
						importHash: randomUUID(),
						notes: "Took target 1",
					},
					{
						...base,
						quantity: "0.20",
						exitDate: at(day + 1, 12),
						exitPrice: "1.0980",
						fees: "1.40",
						netPnl: "-41.40",
						brokerTicket: "9102",
						importHash: randomUUID(),
					},
				])
				.returning();
			created.push(...rows.map((row) => row.id));
			return rows;
		}

		const tradeRows = (ids: number[]) =>
			db
				.select()
				.from(schema.trades)
				.where(orm.inArray(schema.trades.id, ids))
				.orderBy(schema.trades.id);

		async function cashTotals(day: number) {
			const account = await history.loadAccountHistory(ALICE, ALICE_ACCOUNT);
			const days = await calendar.getCalendarData({
				data: {
					portfolioId: ALICE_ACCOUNT,
					timeZone: "UTC",
					year: 2026,
					month: 7,
					from: at(day, 0).toISOString(),
					to: at(day + 2, 0).toISOString(),
				},
			});
			const dayKey = (offset: number) =>
				at(day + offset, 0)
					.toISOString()
					.slice(0, 10);
			return {
				account: account.trades.reduce(
					(sum, trade) =>
						sum +
						(trade.realizations?.reduce((total, r) => total + r.amount, 0) ??
							(trade.status === TradeStatus.Closed ? (trade.netPnl ?? 0) : 0)),
					0,
				),
				days: [days[dayKey(0)]?.netPnl, days[dayKey(1)]?.netPnl],
				ids: account.trades.map((trade) => trade.id),
			};
		}

		it("adopts grouped legacy legs alongside a new trade without changing the position", async () => {
			session.userId = ALICE;
			const imports = await import("@/server/importActions");
			const csv = [
				"ticket,symbol,type,lots,opening_time_utc,closing_time_utc,opening_price,closing_price,profit,commission,swap",
				"9101,EURUSD,buy,0.10,2026-07-15T08:00:00,2026-07-15T10:00:00,1.1000,1.1050,50,-0.70,2",
				"9102,EURUSD,buy,0.20,2026-07-15T08:00:00,2026-07-16T12:00:00,1.1000,1.0980,-40,-1.40,0",
				"9103,NZDUSD,buy,0.10,2026-07-15T08:00:00,2026-07-15T10:00:00,0.6,0.601,10,0,0",
			].join("\n");
			const source = readImportCsv(csv);
			const parsed = await parseImportSource(
				ALICE,
				ALICE_ACCOUNT,
				ImportKind.Trades,
				"USD",
				source.rows,
				source.fields,
			);
			const legs = await brokerLegs(15);
			for (const [index, leg] of legs.entries())
				await db
					.update(schema.trades)
					.set({
						importHash: parsed[index].legacyHash,
						brokerTicket: null,
					})
					.where(orm.eq(schema.trades.id, leg.id));
			const { tradeId: positionId } = await positions.groupImportedTrades({
				data: {
					portfolioId: ALICE_ACCOUNT,
					tradeIds: legs.map((leg) => leg.id),
				},
			});
			created.push(positionId);
			const before = await positions.getPositionExecutions({
				data: { tradeId: positionId },
			});
			const totals = await cashTotals(15);
			const data = {
				portfolioId: ALICE_ACCOUNT,
				kind: ImportKind.Trades,
				sourceCurrency: "USD",
				fileName: "legacy.csv",
				csv,
			};
			const batch = await imports.stageImport({ data });
			batches.push(batch.id);
			expect(batch.rows.map((row) => row.action)).toEqual([
				ImportAction.Adopt,
				ImportAction.Adopt,
				ImportAction.Insert,
			]);
			const applied = await imports.commitImport({
				data: { batchId: batch.id, revision: batch.revision, decisions: [] },
			});
			created.push(
				...applied.outcomes
					.filter((row) => row.action === ImportAction.Insert)
					.map((row) => row.recordId as number),
			);
			expect(Number(applied.summary.accountDelta)).toBe(10);
			expect(applied.summary).toMatchObject({
				actualMutations: 3,
				reconciled: true,
			});
			expect(
				await positions.getPositionExecutions({
					data: { tradeId: positionId },
				}),
			).toMatchObject({
				fills: before.fills,
				replay: before.replay,
				editRevision: before.editRevision,
			});
			expect((await cashTotals(15)).account).toBeCloseTo(totals.account + 10);
			expect(
				(await tradeRows(legs.map((leg) => leg.id))).map((leg) => ({
					groupedIntoId: leg.groupedIntoId,
					fees: leg.fees,
					netPnl: leg.netPnl,
				})),
			).toEqual(
				legs.map((leg) => ({
					groupedIntoId: positionId,
					fees: leg.fees,
					netPnl: leg.netPnl,
				})),
			);
			const repeated = await imports.stageImport({ data });
			batches.push(repeated.id);
			expect(repeated.rows.map((row) => row.action)).toEqual(
				Array(3).fill(ImportAction.Duplicate),
			);
			const undo = await imports.getImportUndoPreview({
				data: { batchId: batch.id },
			});
			expect(
				undo.filter(
					(row) =>
						row.reason ===
						"Trade is grouped into a position. Ungroup it first.",
				),
			).toHaveLength(2);
			const changed = await imports.stageImport({
				data: { ...data, csv: csv.replace(",50,-0.70", ",60,-0.70") },
			});
			batches.push(changed.id);
			await expect(
				imports.commitImport({
					data: {
						batchId: changed.id,
						revision: changed.revision,
						decisions: [
							{
								rowNumber: 2,
								action: ImportAction.Correct,
								targetId: legs[0].id,
							},
						],
					},
				}),
			).rejects.toThrow("Trade is grouped into a position. Ungroup it first.");
		});

		it("groups a suggested partial close into one position with the same account and day totals", async () => {
			session.userId = ALICE;
			const legs = await brokerLegs(1);
			const legIds = legs.map((leg) => leg.id);
			const before = await cashTotals(1);

			const suggestions = await positions.getGroupSuggestions({
				data: { portfolioId: ALICE_ACCOUNT },
			});
			expect(suggestions.map((s) => s.tradeIds)).toContainEqual(legIds);
			const { tradeId } = await positions.groupImportedTrades({
				data: { portfolioId: ALICE_ACCOUNT, tradeIds: legIds },
			});
			created.push(tradeId);
			const after = await cashTotals(1);
			const [position] = await tradeRows([tradeId]);
			const fills = await db
				.select()
				.from(schema.tradeExecutions)
				.where(orm.eq(schema.tradeExecutions.tradeId, tradeId))
				.orderBy(schema.tradeExecutions.sequence);

			expect(after.account).toBeCloseTo(before.account, 2);
			expect(after.days).toEqual(before.days);
			expect(after.ids).toContain(tradeId);
			expect(after.ids).not.toContain(legIds[0]);
			expect(position).toMatchObject({
				status: TradeStatus.Closed,
				quantity: "0.3",
				netPnl: "9.90",
				importHash: null,
				brokerSource: "exness",
				executionCount: 4,
				notes: "Ticket 9101:\nTook target 1",
			});
			expect(
				fills.map((fill) => [fill.kind, fill.realizedPnl, fill.sourceTradeId]),
			).toEqual([
				[ExecutionKind.Entry, null, legIds[0]],
				[ExecutionKind.Entry, null, legIds[1]],
				[ExecutionKind.Exit, "51.30", legIds[0]],
				[ExecutionKind.Exit, "-41.40", legIds[1]],
			]);
			expect(
				(
					await positions.getGroupSuggestions({
						data: { portfolioId: ALICE_ACCOUNT },
					})
				).flatMap((s) => s.tradeIds),
			).not.toContain(legIds[0]);
		});

		it("ungroups to the exact broker rows and refuses changes to a grouped position", async () => {
			session.userId = ALICE;
			const legs = await brokerLegs(10);
			const legIds = legs.map((leg) => leg.id);
			const { tradeId } = await positions.groupImportedTrades({
				data: { portfolioId: ALICE_ACCOUNT, tradeIds: legIds },
			});
			created.push(tradeId);
			const [position] = await tradeRows([tradeId]);

			await expect(
				positions.groupImportedTrades({
					data: { portfolioId: ALICE_ACCOUNT, tradeIds: legIds },
				}),
			).rejects.toThrow("A row is already grouped into a position.");
			await expect(
				positions.addExecution({
					data: {
						tradeId,
						expectedRevision: position.editRevision,
						kind: ExecutionKind.Entry,
						executedAt: at(12, 8).toISOString(),
						price: "1.1",
						quantity: "1",
					},
				}),
			).rejects.toThrow("A grouped position keeps its broker fills.");
			await expect(
				trades.deleteTrade({ data: { id: tradeId } }),
			).rejects.toThrow("Ungroup a grouped position first.");

			await positions.ungroupPosition({ data: { tradeId } });

			expect(await tradeRows(legIds)).toEqual(legs);
			expect(await tradeRows([tradeId])).toEqual([]);
		});

		it("never groups or ungroups another user's rows", async () => {
			session.userId = ALICE;
			const legs = await brokerLegs(20);
			const legIds = legs.map((leg) => leg.id);
			const { tradeId } = await positions.groupImportedTrades({
				data: { portfolioId: ALICE_ACCOUNT, tradeIds: legIds },
			});
			created.push(tradeId);
			await positions.ungroupPosition({ data: { tradeId } });

			session.userId = BOB;
			await expect(
				positions.groupImportedTrades({
					data: { portfolioId: ALICE_ACCOUNT, tradeIds: legIds },
				}),
			).rejects.toThrow("Account not found.");
			await expect(
				positions.groupImportedTrades({
					data: { portfolioId: BOB_ACCOUNT, tradeIds: legIds },
				}),
			).rejects.toThrow("Trade not found");
			await expect(
				positions.getGroupSuggestions({ data: { portfolioId: ALICE_ACCOUNT } }),
			).rejects.toThrow("Account not found.");

			expect((await tradeRows(legIds)).map((row) => row.groupedIntoId)).toEqual(
				[null, null],
			);
		});
	},
);
