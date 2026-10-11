import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ExecutionKind } from "@/lib/position";
import { EMPTY_REVIEW_FIELDS, ReviewKind } from "@/lib/review";
import { sourceDiscrepancies } from "@/lib/review-discrepancies";
import { TradeSide } from "@/lib/trade";
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

// Seed facts from scripts/db/seed-accounts.ts: account 1 reviews in America/New_York.
const ALICE = "seed-alice";
const ALICE_ACCOUNT = 1;
const MONDAY = "2031-03-03";
const WEDNESDAY = "2031-03-05";
const at = (day: string, hour: number) => `${day}T${hour}:00:00.000Z`;

describe.skipIf(!verifyUrl)("reviews of positions with fills", () => {
	let trades: typeof import("@/server/tradeActions");
	let positions: typeof import("@/server/positionActions");
	let reviews: typeof import("@/server/reviewActions");
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
		reviews = await import("@/server/reviewActions");
		session.userId = ALICE;
	});

	// The browser suite runs next on the same database and reads this account.
	afterAll(async () => {
		session.userId = "";
		await db
			.delete(schema.reviewPeriods)
			.where(
				orm.and(
					orm.eq(schema.reviewPeriods.portfolioId, ALICE_ACCOUNT),
					orm.inArray(schema.reviewPeriods.periodStart, [MONDAY, WEDNESDAY]),
				),
			);
		if (created.length)
			await db
				.delete(schema.trades)
				.where(orm.inArray(schema.trades.id, created));
	});

	const revision = async (id: number) => {
		const [row] = await db
			.select({ editRevision: schema.trades.editRevision })
			.from(schema.trades)
			.where(orm.eq(schema.trades.id, id));
		return row.editRevision;
	};
	const addFill = async (
		tradeId: number,
		kind: ExecutionKind,
		executedAt: string,
		quantity: string,
		price: string,
	) =>
		positions.addExecution({
			data: {
				tradeId,
				expectedRevision: await revision(tradeId),
				kind,
				executedAt,
				quantity,
				price,
			},
		});
	const read = (start: string) =>
		reviews.getReviewPeriod({
			data: { portfolioId: ALICE_ACCOUNT, kind: ReviewKind.Daily, start },
		});
	const sourceOf = async (start: string, id: number) =>
		(await read(start)).sources.trades.find((trade) => trade.id === id);

	async function partialPosition() {
		const { id } = await trades.createTrade({
			data: {
				portfolioId: ALICE_ACCOUNT,
				symbol: "EURUSD",
				side: TradeSide.Long,
				entryDate: at(MONDAY, 14),
				entryPrice: "1.1000",
				quantity: "1",
			},
		});
		created.push(id);
		await addFill(id, ExecutionKind.Exit, at(MONDAY, 15), "0.5", "1.1050");
		await addFill(id, ExecutionKind.Exit, at(WEDNESDAY, 15), "0.5", "1.0980");
		return id;
	}

	it("puts the position in the review of each fill day with the exits of that day", async () => {
		const id = await partialPosition();

		const monday = await read(MONDAY);
		const wednesday = await read(WEDNESDAY);

		expect(
			monday.sources.trades.find((trade) => trade.id === id)?.fills,
		).toMatchObject([
			{ kind: ExecutionKind.Entry },
			{
				kind: ExecutionKind.Exit,
				realizedPnl: "250.00",
				closesPosition: false,
			},
		]);
		expect(
			wednesday.sources.trades.find((trade) => trade.id === id)?.fills,
		).toEqual([
			expect.objectContaining({ realizedPnl: "-100.00", closesPosition: true }),
		]);
		expect(await sourceOf("2031-03-04", id)).toBeUndefined();
	});

	it("keeps the saved snapshot and shows a change after a fill edit that keeps the totals", async () => {
		const id = await partialPosition();
		await reviews.saveReviewPeriod({
			data: {
				portfolioId: ALICE_ACCOUNT,
				kind: ReviewKind.Daily,
				start: MONDAY,
				expectedRevision: (await read(MONDAY)).revision,
				complete: true,
				fields: EMPTY_REVIEW_FIELDS,
			},
		});
		const saved = (await read(MONDAY)).tradeLinks.find(
			(link) => link.tradeId === id,
		);
		const { fills } = await positions.getPositionExecutions({
			data: { tradeId: id },
		});
		const mondayExit = fills.find((f) => f.kind === ExecutionKind.Exit);

		await positions.updateExecution({
			data: {
				tradeId: id,
				executionId: mondayExit?.id as number,
				expectedRevision: await revision(id),
				kind: ExecutionKind.Exit,
				executedAt: at(MONDAY, 16),
				quantity: "0.5",
				price: "1.1050",
			},
		});
		const after = await read(MONDAY);

		expect(
			sourceDiscrepancies(after.sources.trades, after.tradeLinks).changed,
		).toBeGreaterThan(0);
		expect(after.tradeLinks.find((link) => link.tradeId === id)).toEqual(saved);
	});

	it("skips a leg that is grouped into another position", async () => {
		const id = await partialPosition();
		const { id: leg } = await trades.createTrade({
			data: {
				portfolioId: ALICE_ACCOUNT,
				symbol: "EURUSD",
				side: TradeSide.Long,
				entryDate: at(MONDAY, 16),
				entryPrice: "1.1000",
				quantity: "1",
			},
		});
		created.push(leg);
		await db
			.update(schema.trades)
			.set({ groupedIntoId: id })
			.where(orm.eq(schema.trades.id, leg));

		expect(await sourceOf(MONDAY, leg)).toBeUndefined();
	});
});
