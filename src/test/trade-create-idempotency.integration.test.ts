import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TradeSide } from "@/lib/trade";
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
const BOB_ACCOUNT = 4;
const DRAFT_ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const SYMBOLS = ["DRAFTA", "DRAFTB", "NODRAFT"];

const capture = (portfolioId: number, symbol: string) => ({
	portfolioId,
	symbol,
	side: TradeSide.Long,
	entryDate: "2026-09-02T08:00:00Z",
	entryPrice: "100",
	quantity: "1",
});

describe.skipIf(!verifyUrl)("idempotent trade create", () => {
	let createTrade: typeof import("@/server/tradeActions").createTrade;
	let loadArchiveTables: typeof import("@/db/journal-archive").loadArchiveTables;
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");

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
		({ createTrade } = await import("@/server/tradeActions"));
		({ loadArchiveTables } = await import("@/db/journal-archive"));
	});

	// The browser suite runs next on the same database and reads these accounts.
	afterAll(async () => {
		session.userId = "";
		const { inArray } = await import("drizzle-orm");
		await db
			.delete(schema.trades)
			.where(inArray(schema.trades.symbol, SYMBOLS));
	});

	const tradesWithSymbol = async (symbol: string) => {
		const { eq } = await import("drizzle-orm");
		return db
			.select()
			.from(schema.trades)
			.where(eq(schema.trades.symbol, symbol));
	};

	it("returns the same trade when one user sends one draft id twice", async () => {
		session.userId = ALICE;
		const data = {
			...capture(ALICE_ACCOUNT, "DRAFTA"),
			clientDraftId: DRAFT_ID,
		};

		const first = await createTrade({ data });
		const second = await createTrade({ data });

		expect(first).toEqual({
			success: true,
			id: first.id,
			duplicate: false,
			ruleCheck: null,
		});
		expect(second).toEqual({
			success: true,
			id: first.id,
			duplicate: true,
			ruleCheck: null,
		});
		const rows = await tradesWithSymbol("DRAFTA");
		expect(rows.map((row) => row.id)).toEqual([first.id]);
	});

	it("makes a new trade for another user with the same draft id", async () => {
		session.userId = ALICE;
		const [alice] = await tradesWithSymbol("DRAFTA");
		session.userId = BOB;

		const result = await createTrade({
			data: { ...capture(BOB_ACCOUNT, "DRAFTB"), clientDraftId: DRAFT_ID },
		});

		expect(result.duplicate).toBe(false);
		expect(result.id).not.toBe(alice.id);
		const [bob] = await tradesWithSymbol("DRAFTB");
		expect(bob).toMatchObject({ id: result.id, userId: BOB });
		expect(await tradesWithSymbol("DRAFTA")).toEqual([alice]);
	});

	it("inserts each call when no draft id is sent", async () => {
		session.userId = ALICE;
		const data = capture(ALICE_ACCOUNT, "NODRAFT");

		const first = await createTrade({ data });
		const second = await createTrade({ data });

		expect([first.duplicate, second.duplicate]).toEqual([false, false]);
		expect(second.id).not.toBe(first.id);
		expect(await tradesWithSymbol("NODRAFT")).toHaveLength(2);
	});

	it("leaves the draft id out of the archive", async () => {
		const { trades } = await loadArchiveTables(ALICE);

		expect(trades.some((trade) => trade.symbol === "DRAFTA")).toBe(true);
		expect(trades.every((trade) => !("clientDraftId" in trade))).toBe(true);
	});
});
