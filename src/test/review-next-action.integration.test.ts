import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toDayKey } from "@/lib/date";
import { EMPTY_REVIEW_FIELDS, ReviewKind } from "@/lib/review";
import { reviewPeriod } from "@/lib/review-period";
import { checkTarget } from "../../scripts/db/target";

// Runs in `npm run verify` on the seeded database, as session-insights.integration.test.ts.
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
const LINE = "- Tag A. Trades: /journal?status=CLOSED&tags=1";

describe.skipIf(!verifyUrl)("add a finding to the next review", () => {
	let reviews: typeof import("@/server/reviewActions");
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");
	let portfolioId = 0;
	const start = reviewPeriod(
		toDayKey(new Date(), "UTC"),
		ReviewKind.Weekly,
		1,
	).periodStart;

	const add = (userId: string) => {
		session.userId = userId;
		return reviews.addReviewNextAction({ data: { portfolioId, line: LINE } });
	};
	const saved = () =>
		db
			.select()
			.from(schema.reviewPeriods)
			.where(orm.eq(schema.reviewPeriods.portfolioId, portfolioId));

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
		reviews = await import("@/server/reviewActions");

		const [account] = await db
			.insert(schema.portfolios)
			.values({
				userId: ALICE,
				name: "Next action fixture",
				reviewTimezone: "UTC",
				reviewWeekStartsOn: 1,
			})
			.returning({ id: schema.portfolios.id });
		portfolioId = account.id;
	});

	afterAll(async () => {
		session.userId = "";
		if (!db || !portfolioId) return;
		await db
			.delete(schema.portfolios)
			.where(orm.eq(schema.portfolios.id, portfolioId));
	});

	it("does not let another user write to the review", async () => {
		await expect(add(BOB)).rejects.toThrow("Account not found.");
		expect(await saved()).toEqual([]);
	});

	it("appends the line once and keeps the existing text", async () => {
		session.userId = ALICE;
		await reviews.saveReviewPeriod({
			data: {
				portfolioId,
				kind: ReviewKind.Weekly,
				start,
				expectedRevision: 0,
				fields: { ...EMPTY_REVIEW_FIELDS, nextAction: "Size down." },
				complete: false,
			},
		});

		expect(await add(ALICE)).toEqual({ start, added: true });
		expect(await add(ALICE)).toEqual({ start, added: false });
		await expect(add(BOB)).rejects.toThrow("Account not found.");

		const [review] = await saved();
		expect(review).toMatchObject({
			kind: ReviewKind.Weekly,
			periodStart: start,
			nextAction: `Size down.\n${LINE}`,
			revision: 2,
		});
	});

	it("refuses a complete review", async () => {
		session.userId = ALICE;
		const [review] = await saved();
		await reviews.saveReviewPeriod({
			data: {
				portfolioId,
				kind: ReviewKind.Weekly,
				start,
				expectedRevision: review.revision,
				fields: { ...EMPTY_REVIEW_FIELDS, nextAction: review.nextAction },
				complete: true,
			},
		});

		await expect(add(ALICE)).rejects.toThrow(
			"This week's review is complete. Reopen it to add the action.",
		);
	});
});
