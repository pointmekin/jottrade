import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trades } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { createSignedUploadUrl, deleteGcpObject } from '@/lib/gcp';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES = 10;

function buildPublicUrl(bucketName: string, objectName: string): string {
  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}

function validateImageUrl(url: string, userId: string, tradeId: number): boolean {
  const bucket = process.env.GCP_BUCKET_NAME!;
  const prefix = `https://storage.googleapis.com/${bucket}/trades/${userId}/${tradeId}/`;
  return url.startsWith(prefix);
}

export const getSignedUploadUrl = createServerFn({ method: 'POST' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const { tradeId, fileName, contentType } = z.object({
      tradeId: z.number(),
      fileName: z.string().min(1).max(255),
      contentType: z.enum(ALLOWED_TYPES as [string, ...string[]]),
    }).parse(ctx.data);

    // Verify ownership
    const [trade] = await db.select({ id: trades.id, screenshots: trades.screenshots })
      .from(trades)
      .where(and(eq(trades.id, tradeId), eq(trades.userId, session.user.id)));
    if (!trade) throw new Error('Trade not found');

    const existing = (trade.screenshots as string[] | null) ?? [];
    if (existing.length >= MAX_IMAGES) throw new Error(`Max ${MAX_IMAGES} images per trade`);

    const objectName = `trades/${session.user.id}/${tradeId}/${fileName}`;
    const signedUrl = await createSignedUploadUrl(objectName, contentType);

    return {
      signedUrl,
      publicUrl: buildPublicUrl(process.env.GCP_BUCKET_NAME!, objectName),
    };
  });

export const saveTradeImage = createServerFn({ method: 'POST' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const { tradeId, url } = z.object({
      tradeId: z.number(),
      url: z.string().url(),
    }).parse(ctx.data);

    if (!validateImageUrl(url, session.user.id, tradeId)) {
      throw new Error('Invalid image URL');
    }

    const [trade] = await db.select({ screenshots: trades.screenshots })
      .from(trades)
      .where(and(eq(trades.id, tradeId), eq(trades.userId, session.user.id)));
    if (!trade) throw new Error('Trade not found');

    const existing = (trade.screenshots as string[] | null) ?? [];
    if (existing.length >= MAX_IMAGES) throw new Error(`Max ${MAX_IMAGES} images per trade`);

    await db.update(trades)
      .set({ screenshots: [...existing, url] })
      .where(eq(trades.id, tradeId));

    return { success: true };
  });

export const deleteTradeImage = createServerFn({ method: 'POST' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const { tradeId, url } = z.object({
      tradeId: z.number(),
      url: z.string().url(),
    }).parse(ctx.data);

    // Verify ownership
    const [trade] = await db.select({ screenshots: trades.screenshots })
      .from(trades)
      .where(and(eq(trades.id, tradeId), eq(trades.userId, session.user.id)));
    if (!trade) throw new Error('Trade not found');

    if (!validateImageUrl(url, session.user.id, tradeId)) {
      throw new Error('Invalid image URL');
    }

    // Delete from GCP
    const bucket = process.env.GCP_BUCKET_NAME!;
    const objectName = url.replace(`https://storage.googleapis.com/${bucket}/`, '');
    await deleteGcpObject(objectName);

    // Remove from screenshots array
    const existing = (trade.screenshots as string[] | null) ?? [];
    await db.update(trades)
      .set({ screenshots: existing.filter((u) => u !== url) })
      .where(eq(trades.id, tradeId));

    return { success: true };
  });
