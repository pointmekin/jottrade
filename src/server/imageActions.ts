import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import {
	createSignedUploadUrl,
	deleteGcpObject,
	publicObjectUrl,
} from "@/lib/gcp";

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
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		requireRoomForImage(await requireOwnedScreenshots(userId, data.tradeId));
		const objectName = `${objectPrefix(userId, data.tradeId)}${data.fileName}`;
		return {
			signedUrl: await createSignedUploadUrl(objectName, data.contentType),
			publicUrl: publicObjectUrl(objectName),
		};
	});

export const saveTradeImage = createServerFn({ method: "POST" })
	.validator(imageSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		requireOwnObjectName(data.url, userId, data.tradeId);
		const screenshots = await requireOwnedScreenshots(userId, data.tradeId);
		requireRoomForImage(screenshots);
		await db
			.update(trades)
			.set({ screenshots: [...screenshots, data.url] })
			.where(eq(trades.id, data.tradeId));
		return { success: true };
	});

export const deleteTradeImage = createServerFn({ method: "POST" })
	.validator(imageSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const screenshots = await requireOwnedScreenshots(userId, data.tradeId);
		await deleteGcpObject(requireOwnObjectName(data.url, userId, data.tradeId));
		await db
			.update(trades)
			.set({ screenshots: screenshots.filter((url) => url !== data.url) })
			.where(eq(trades.id, data.tradeId));
		return { success: true };
	});
