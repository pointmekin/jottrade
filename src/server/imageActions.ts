import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { trades } from "@/db/schema";
import {
	createSignedUploadUrl,
	deleteGcpObject,
	publicObjectUrl,
} from "@/lib/gcp";
import { authMiddleware } from "./auth-middleware";

const MAX_IMAGES = 10;

const imageSchema = z.object({ tradeId: z.number(), url: z.url() });

const objectPrefix = (userId: string, tradeId: number) =>
	`trades/${userId}/${tradeId}/`;

async function requireOwnedScreenshots(userId: string, tradeId: number) {
	const [trade] = await db
		.select({ screenshots: trades.screenshots })
		.from(trades)
		.where(and(eq(trades.id, tradeId), eq(trades.userId, userId)));
	if (!trade) throw new Error("Trade not found");
	return trade.screenshots ?? [];
}

function requireRoomForImage(screenshots: string[]) {
	if (screenshots.length >= MAX_IMAGES) {
		throw new Error(`Max ${MAX_IMAGES} images per trade`);
	}
}

/** Only URLs under the trade's own folder, so a user cannot attach or delete another object. */
function requireOwnObjectName(url: string, userId: string, tradeId: number) {
	const prefix = publicObjectUrl("");
	const objectName = url.startsWith(prefix) ? url.slice(prefix.length) : "";
	if (!objectName.startsWith(objectPrefix(userId, tradeId))) {
		throw new Error("Invalid image URL");
	}
	return objectName;
}

export const getSignedUploadUrl = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			tradeId: z.number(),
			fileName: z.string().min(1).max(255),
			contentType: z.enum([
				"image/jpeg",
				"image/png",
				"image/webp",
				"image/gif",
			]),
		}),
	)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		requireRoomForImage(await requireOwnedScreenshots(userId, data.tradeId));
		const reserved = await db
			.update(trades)
			.set({ editRevision: sql`${trades.editRevision}+1` })
			.where(and(eq(trades.id, data.tradeId), eq(trades.userId, userId)))
			.returning({ id: trades.id });
		if (!reserved.length)
			throw new Error("Trade was removed before the upload started.");
		const objectName = `${objectPrefix(userId, data.tradeId)}${data.fileName}`;
		return {
			signedUrl: await createSignedUploadUrl(objectName, data.contentType),
			publicUrl: publicObjectUrl(objectName),
		};
	});

export const saveTradeImage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(imageSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		requireOwnObjectName(data.url, userId, data.tradeId);
		const screenshots = await requireOwnedScreenshots(userId, data.tradeId);
		requireRoomForImage(screenshots);
		const saved = await db
			.update(trades)
			.set({
				screenshots: sql`COALESCE(${trades.screenshots},'[]'::jsonb) || jsonb_build_array(${data.url}::text)`,
				editRevision: sql`${trades.editRevision}+1`,
			})
			.where(
				and(
					eq(trades.id, data.tradeId),
					eq(trades.userId, userId),
					sql`jsonb_array_length(COALESCE(${trades.screenshots},'[]'::jsonb)) < ${MAX_IMAGES}`,
					sql`NOT (COALESCE(${trades.screenshots},'[]'::jsonb) @> jsonb_build_array(${data.url}::text))`,
				),
			)
			.returning({ id: trades.id });
		if (!saved.length)
			throw new Error(
				"Trade was removed, image already attached, or image limit reached.",
			);
		return { success: true };
	});

export const deleteTradeImage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(imageSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		await requireOwnedScreenshots(userId, data.tradeId);
		const reserved = await db
			.update(trades)
			.set({ editRevision: sql`${trades.editRevision}+1` })
			.where(and(eq(trades.id, data.tradeId), eq(trades.userId, userId)))
			.returning({ id: trades.id });
		if (!reserved.length)
			throw new Error("Trade was removed before image deletion.");
		await deleteGcpObject(requireOwnObjectName(data.url, userId, data.tradeId));
		const removed = await db
			.update(trades)
			.set({
				screenshots: sql`COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements_text(COALESCE(${trades.screenshots},'[]'::jsonb)) value WHERE value <> ${data.url}), '[]'::jsonb)`,
				editRevision: sql`${trades.editRevision}+1`,
			})
			.where(and(eq(trades.id, data.tradeId), eq(trades.userId, userId)))
			.returning({ id: trades.id });
		if (!removed.length)
			throw new Error("Trade was removed during image deletion.");
		return { success: true };
	});
