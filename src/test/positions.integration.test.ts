import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { ExecutionKind, type executionInputSchema } from "@/lib/position";
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

// Seed facts from scripts/db/seed-accounts.ts.
const ALICE = "seed-alice";
const BOB = "seed-bob";
const ALICE_ACCOUNT = 1;

const at = (hour: number) => new Date(Date.UTC(2026, 8, 3, hour)).toISOString();
const entry = (hour: number, quantity: string, price: string) => ({
	kind: ExecutionKind.Entry,
	executedAt: at(hour),
	price,
	quantity,
});
const exit = (hour: number, quantity: string, price: string) => ({
	kind: ExecutionKind.Exit,
	executedAt: at(hour),
	price,
	quantity,
});

describe.skipIf(!verifyUrl)("position fills on the seeded database", () => {
	let trades: typeof import("@/server/tradeActions");
	let positions: typeof import("@/server/positionActions");
	let calendar: typeof import("@/server/calendarActions");
	let history: typeof import("@/db/account-history");
	let withRealizations: typeof import("@/db/positions").withRealizations;
	let loadArchiveTables: typeof import("@/db/journal-archive").loadArchiveTables;
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");
	const created: number[] = [];

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
		trades = await import("@/server/tradeActions");
		positions = await import("@/server/positionActions");
		calendar = await import("@/server/calendarActions");
		history = await import("@/db/account-history");
		({ withRealizations } = await import("@/db/positions"));
		({ loadArchiveTables } = await import("@/db/journal-archive"));
	});

	// The browser suite runs next on the same database and reads these accounts.
	afterAll(async () => {
		session.userId = "";
		if (created.length)
			await db
				.delete(schema.trades)
				.where(orm.inArray(schema.trades.id, created));
	});

	async function aliceTrade(exitPrice?: string) {
		session.userId = ALICE;
		const { id } = await trades.createTrade({
			data: {
				portfolioId: ALICE_ACCOUNT,
				symbol: "EURUSD",
				side: TradeSide.Long,
				entryDate: at(1),
				entryPrice: "1.1000",
				quantity: "1",
				...(exitPrice ? { exitPrice, exitDate: at(5) } : {}),
			},
		});
		created.push(id);
		return id;
	}

	const tradeRow = async (id: number) => {
		const [row] = await db
			.select()
			.from(schema.trades)
			.where(orm.eq(schema.trades.id, id));
		return row;
	};
	const fillRows = (tradeId: number) =>
		db
			.select()
			.from(schema.tradeExecutions)
			.where(orm.eq(schema.tradeExecutions.tradeId, tradeId))
			.orderBy(schema.tradeExecutions.sequence);
	const stored = async (id: number) => ({
		trade: await tradeRow(id),
		fills: await fillRows(id),
	});
	const add = async (
		tradeId: number,
		fill: z.input<typeof executionInputSchema>,
		revision?: number,
	) =>
		positions.addExecution({
			data: {
				tradeId,
				expectedRevision: revision ?? (await tradeRow(tradeId)).editRevision,
				...fill,
			},
		});

	it("stores two entries and two partial exits with the replay totals", async () => {
		const id = await aliceTrade();

		await add(id, entry(2, "1.0", "1.0950"));
		await add(id, exit(3, "0.5", "1.1050"));
		await add(id, exit(4, "1.5", "1.1000"));

		const { trade, fills } = await stored(id);
		expect(trade).toMatchObject({
			entryPrice: "1.0975",
			quantity: "2",
			exitPrice: "1.10125",
			exitDate: new Date(at(4)),
			fees: "0",
			netPnl: "750.00",
			returnPercent: "0.34",
			status: TradeStatus.Closed,
			executionCount: 4,
			editRevision: 3,
		});
		expect(
			fills.map(({ kind, realizedPnl, sequence, userId, portfolioId }) => ({
				kind,
				realizedPnl,
				sequence,
				userId,
				portfolioId,
			})),
		).toEqual(
			[
				[ExecutionKind.Entry, null],
				[ExecutionKind.Entry, null],
				[ExecutionKind.Exit, "375.00"],
				[ExecutionKind.Exit, "375.00"],
			].map(([kind, realizedPnl], index) => ({
				kind,
				realizedPnl,
				sequence: index + 1,
				userId: ALICE,
				portfolioId: ALICE_ACCOUNT,
			})),
		);
		const read = await positions.getPositionExecutions({
			data: { tradeId: id },
		});
		expect(read).toMatchObject({ isMaterialized: true, replay: { ok: true } });
	});

	it("rejects invalid fills with a typed message and changes nothing", async () => {
		const id = await aliceTrade();
		await add(id, exit(2, "0.4", "1.1050"));
		const before = await stored(id);

		await expect(add(id, exit(3, "0.7", "1.1050"))).rejects.toThrow(
			"You can close up to 0.6.",
		);
		await expect(add(id, exit(0, "0.1", "1.1050"))).rejects.toThrow(
			"An exit cannot come before the first entry.",
		);
		await expect(add(id, exit(3, "0", "1.1050"))).rejects.toThrow();
		await add(id, exit(3, "0.6", "1.1050"));
		const closed = await stored(id);
		await expect(add(id, entry(4, "1", "1.1"))).rejects.toThrow(
			"This position is closed. Log a new trade.",
		);

		expect(before.trade.editRevision).toBe(1);
		expect(closed.trade.status).toBe(TradeStatus.Closed);
		expect(await stored(id)).toEqual(closed);
	});

	it("keeps a legacy trade until its first fill, and refuses a P&L mismatch or an imported row", async () => {
		const id = await aliceTrade("1.1010");
		const legacy = await tradeRow(id);
		expect(legacy).toMatchObject({ executionCount: 0, netPnl: "100.00" });
		expect(await fillRows(id)).toEqual([]);

		await db
			.update(schema.trades)
			.set({ netPnl: "100.40" })
			.where(orm.eq(schema.trades.id, id));
		await expect(add(id, entry(2, "1", "1.0950"))).rejects.toThrow(
			"differs from the saved P&L by $0.40",
		);
		await db
			.update(schema.trades)
			.set({ netPnl: "100.00", importHash: `positions-test-${id}` })
			.where(orm.eq(schema.trades.id, id));
		await expect(add(id, entry(2, "1", "1.0950"))).rejects.toThrow(
			"Broker rows cannot get manual fills.",
		);
		expect(await fillRows(id)).toEqual([]);

		await db
			.update(schema.trades)
			.set({ importHash: null })
			.where(orm.eq(schema.trades.id, id));
		await add(id, entry(2, "1", "1.0950"));
		expect(await tradeRow(id)).toMatchObject({
			executionCount: 3,
			quantity: "2",
			status: TradeStatus.Open,
			netPnl: null,
		});
	});

	it("refuses another user and a stale revision, and changes nothing", async () => {
		const id = await aliceTrade();
		const before = await stored(id);

		session.userId = BOB;
		await expect(
			positions.getPositionExecutions({ data: { tradeId: id } }),
		).rejects.toThrow("Trade not found");
		await expect(add(id, exit(2, "0.5", "1.1"), 0)).rejects.toThrow(
			"Trade not found",
		);
		await expect(
			positions.deleteExecution({
				data: { tradeId: id, executionId: 1, expectedRevision: 0 },
			}),
		).rejects.toThrow("Trade not found");
		session.userId = ALICE;
		await expect(add(id, exit(2, "0.5", "1.1"), 5)).rejects.toThrow(
			"Trade changed",
		);

		expect(await stored(id)).toEqual(before);
		const archive = await loadArchiveTables(BOB);
		expect(archive.tradeExecutions.every((f) => f.tradeId !== id)).toBe(true);
	});

	it("keeps one valid replay when two adds race on one revision", async () => {
		const id = await aliceTrade();

		const results = await Promise.allSettled([
			add(id, exit(2, "0.6", "1.1050"), 0),
			add(id, exit(3, "0.6", "1.1050"), 0),
		]);

		expect(results.map((r) => r.status).sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
		const { trade, fills } = await stored(id);
		expect(trade).toMatchObject({ executionCount: 2, editRevision: 1 });
		expect(fills.map((f) => f.kind)).toEqual([
			ExecutionKind.Entry,
			ExecutionKind.Exit,
		]);
		const archive = await loadArchiveTables(ALICE);
		expect(
			archive.tradeExecutions.filter((f) => f.tradeId === id),
		).toHaveLength(2);
	});

	it("reads a partial exit on its own day for the owner only", async () => {
		const id = await aliceTrade();
		const partialAt = new Date(Date.UTC(2026, 8, 4, 10)).toISOString();
		await add(id, { ...exit(0, "0.4", "1.1050"), executedAt: partialAt });

		const account = await history.loadAccountHistory(ALICE, ALICE_ACCOUNT);
		const position = account.trades.find((trade) => trade.id === id);
		expect(position).toMatchObject({
			status: TradeStatus.Open,
			realizations: [{ at: new Date(partialAt), amount: 200 }],
		});
		const asBob = await withRealizations(BOB, [
			position as (typeof account.trades)[number],
		]);
		expect(asBob[0].realizations).toEqual([]);

		const days = await calendar.getCalendarData({
			data: {
				portfolioId: ALICE_ACCOUNT,
				timeZone: "UTC",
				year: 2026,
				month: 9,
				from: "2026-09-04T00:00:00.000Z",
				to: "2026-09-05T00:00:00.000Z",
			},
		});
		expect(
			days["2026-09-04"].trades.find((trade) => trade.id === id),
		).toMatchObject({ netPnl: 200, isPartialExit: true });
	});
});
