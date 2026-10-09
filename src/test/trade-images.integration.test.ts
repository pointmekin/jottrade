import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkTarget } from "../../scripts/db/target";

// `npm run verify` runs this file on its disposable database. Only the
// session, the server-function wrapper and the GCP signature are replaced.
const verifyUrl = process.env.VERIFY_DATABASE_URL;

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
	requireUserId: async () => {
		if (!session.userId) throw new Error("Unauthorized");
		return session.userId;
	},
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
vi.mock("@/lib/gcp", async (importOriginal) => ({
	...(await importOriginal<object>()),
	createSignedUploadUrl: async (objectName: string) =>
		`https://signed/${objectName}`,
}));

// Seed facts from scripts/db/seed-accounts.ts.
const ALICE = "seed-alice";
const BOB = "seed-bob";
const BUCKET = "test-bucket";
const objectUrl = (objectName: string) =>
	`https://storage.googleapis.com/${BUCKET}/${objectName}`;

describe.skipIf(!verifyUrl)("trade screenshots on the seeded database", () => {
	let images: typeof import("@/server/imageActions");
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");
	const tradeOf: Record<string, { id: number; screenshots: string[] }> = {};

	const screenshotsOf = async (tradeId: number) => {
		const [row] = await db
			.select({ screenshots: schema.trades.screenshots })
			.from(schema.trades)
			.where(orm.eq(schema.trades.id, tradeId));
		return row.screenshots ?? [];
	};

	beforeAll(async () => {
		const target = checkTarget({ ...process.env, DATABASE_URL: verifyUrl });
		if (!target.ok || !target.database.startsWith("jottrade_test_")) {
			throw new Error(
				"These tests need a disposable jottrade_test_* database.",
			);
		}
		vi.stubEnv("GCP_BUCKET_NAME", BUCKET);
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		orm = await import("drizzle-orm");
		images = await import("@/server/imageActions");
		for (const userId of [ALICE, BOB]) {
			const [trade] = await db
				.select({
					id: schema.trades.id,
					screenshots: schema.trades.screenshots,
				})
				.from(schema.trades)
				.where(orm.eq(schema.trades.userId, userId))
				.limit(1);
			tradeOf[userId] = { id: trade.id, screenshots: trade.screenshots ?? [] };
		}
	});

	afterAll(async () => {
		session.userId = "";
		for (const { id, screenshots } of Object.values(tradeOf)) {
			await db
				.update(schema.trades)
				.set({ screenshots })
				.where(orm.eq(schema.trades.id, id));
		}
		vi.unstubAllEnvs();
	});

	it("names each object by the upload id, not by the file name", async () => {
		session.userId = ALICE;
		const tradeId = tradeOf[ALICE].id;
		const [first, second] = [randomUUID(), randomUUID()];

		const one = await images.getSignedUploadUrl({
			data: { tradeId, uploadId: first, contentType: "image/jpeg" },
		});
		const two = await images.getSignedUploadUrl({
			data: { tradeId, uploadId: second, contentType: "image/jpeg" },
		});

		expect(one.publicUrl).toBe(
			objectUrl(`trades/${ALICE}/${tradeId}/${first}.jpg`),
		);
		expect(two.publicUrl).toBe(
			objectUrl(`trades/${ALICE}/${tradeId}/${second}.jpg`),
		);
	});

	it("keeps one entry when the same URL is saved twice", async () => {
		session.userId = ALICE;
		const tradeId = tradeOf[ALICE].id;
		const { publicUrl } = await images.getSignedUploadUrl({
			data: { tradeId, uploadId: randomUUID(), contentType: "image/png" },
		});

		const saved = await images.saveTradeImage({
			data: { tradeId, url: publicUrl },
		});
		const retried = await images.saveTradeImage({
			data: { tradeId, url: publicUrl },
		});

		expect(saved).toEqual({ success: true, alreadyAttached: false });
		expect(retried).toEqual({ success: true, alreadyAttached: true });
		const screenshots = await screenshotsOf(tradeId);
		expect(screenshots.filter((url) => url === publicUrl)).toHaveLength(1);
	});

	it("refuses a URL under another user's prefix", async () => {
		const aliceTrade = tradeOf[ALICE].id;
		const bobTrade = tradeOf[BOB].id;
		const aliceUrl = objectUrl(
			`trades/${ALICE}/${aliceTrade}/${randomUUID()}.png`,
		);
		const before = await screenshotsOf(aliceTrade);
		session.userId = BOB;

		await expect(
			images.saveTradeImage({ data: { tradeId: bobTrade, url: aliceUrl } }),
		).rejects.toThrow("Invalid image URL");
		await expect(
			images.saveTradeImage({ data: { tradeId: aliceTrade, url: aliceUrl } }),
		).rejects.toThrow("Invalid image URL");
		await expect(
			images.getSignedUploadUrl({
				data: {
					tradeId: aliceTrade,
					uploadId: randomUUID(),
					contentType: "image/png",
				},
			}),
		).rejects.toThrow("Trade not found");
		expect(await screenshotsOf(aliceTrade)).toEqual(before);
		expect(await screenshotsOf(bobTrade)).not.toContain(aliceUrl);
	});
});
