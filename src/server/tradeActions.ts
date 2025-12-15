import { createServerFn } from '@tanstack/react-start';
import { db } from '@/db';
import { trades } from '@/db/schema';
// import { getWebRequest } from 'vinxi/http';
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from '@/lib/auth';
import { z } from 'zod';

const tradeSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["LONG", "SHORT"]),
  entryDate: z.string().transform((str) => new Date(str)), // Input as string from form
  entryPrice: z.string().transform((str) => str.toString()), // Ensure string for numeric
  quantity: z.string().transform((str) => str.toString()),
  notes: z.string().optional(),
  portfolioId: z.number().optional()
});

export const createTrade = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const data = ctx.data as z.infer<typeof tradeSchema>;
    // Validate manually if needed, or trust the type if client sends strictly
    // If "data" is the raw payload here
    const validatedData = tradeSchema.parse(data);
    // const request = getWebRequest();
    const session = await auth.api.getSession({
        headers: getRequestHeaders()
    });

    if (!session) {
      throw new Error("Unauthorized");
    }

    // Default portfolio handling (placeholder)
    const portfolioId = validatedData.portfolioId; 

    await db.insert(trades).values({
      userId: session.user.id,
      portfolioId: portfolioId,
      symbol: validatedData.symbol,
      side: validatedData.side,
      entryDate: validatedData.entryDate,
      entryPrice: validatedData.entryPrice,
      quantity: validatedData.quantity,
      notes: validatedData.notes,
      status: "OPEN"
    });

    return { success: true };
});
