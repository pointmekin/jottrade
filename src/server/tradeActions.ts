import { createServerFn } from '@tanstack/react-start';
import { db } from '@/db';
import { trades } from '@/db/schema';
// import { getWebRequest } from 'vinxi/http';
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from '@/lib/auth';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { calculatePnL } from '@/lib/finance';

const tradeSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["LONG", "SHORT"]),
  entryDate: z.string().transform((str) => new Date(str)), // Input as string from form
  entryPrice: z.string(), // Ensure string for numeric
  quantity: z.string(),
  notes: z.string().optional(),
  portfolioId: z.number().optional(),
  
  // Optional Exit fields for "Closed" entry or updates
  exitDate: z.string().optional().transform((str) => str ? new Date(str) : undefined),
  exitPrice: z.string().optional(),
  fees: z.string().optional().default("0"),
  status: z.string().optional(), // OPEN, CLOSED, PENDING
});

// For update, we might need ID
const updateTradeSchema = tradeSchema.partial().extend({
    id: z.number(),
});

const deleteTradeSchema = z.object({
    id: z.number(),
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

    // Calculate P&L if exit exists
    let netPnl = undefined;
    let returnPercent = undefined;
    let status = validatedData.status || "OPEN";

    if (validatedData.exitPrice && validatedData.entryPrice) {
        const pnl = calculatePnL(
            validatedData.side, 
            validatedData.entryPrice, 
            validatedData.exitPrice, 
            validatedData.quantity,
            validatedData.fees
        );
        netPnl = pnl.netPnl;
        returnPercent = pnl.returnPercent;
        if (!validatedData.status) status = "CLOSED";
    }

    await db.insert(trades).values({
      userId: session.user.id,
      portfolioId: portfolioId,
      symbol: validatedData.symbol,
      side: validatedData.side,
      entryDate: validatedData.entryDate,
      entryPrice: validatedData.entryPrice,
      quantity: validatedData.quantity,
      notes: validatedData.notes,
      
      exitDate: validatedData.exitDate,
      exitPrice: validatedData.exitPrice,
      fees: validatedData.fees,
      
      netPnl,
      returnPercent,
      status
    });

    return { success: true };
});

export const updateTrade = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
      const data = ctx.data as z.infer<typeof updateTradeSchema>;
      const validatedData = updateTradeSchema.parse(data);
      const session = await auth.api.getSession({
        headers: getRequestHeaders()
      });

    if (!session) {
      throw new Error("Unauthorized");
    }

    // Fetch existing trade to merge/recalc?
    // For simplicity, we assume frontend sends necessary data or we just update fields present.
    // But P&L calc needs entry price if we are just updating exit price.
    // So let's fetch it.
    const [existingTrade] = await db.select().from(trades).where(
        and(
            eq(trades.id, validatedData.id),
            eq(trades.userId, session.user.id)
        )
    );

    if (!existingTrade) throw new Error("Trade not found");

    const side = validatedData.side || existingTrade.side as "LONG" | "SHORT";
    const entryPrice = validatedData.entryPrice || existingTrade.entryPrice;
    const exitPrice = validatedData.exitPrice || existingTrade.exitPrice;
    const quantity = validatedData.quantity || existingTrade.quantity;
    const fees = validatedData.fees || existingTrade.fees;

    let netPnl = existingTrade.netPnl;
    let returnPercent = existingTrade.returnPercent;
    let status = validatedData.status || existingTrade.status;

    if (exitPrice && entryPrice && quantity) {
         const pnl = calculatePnL(side, entryPrice, exitPrice, quantity, fees || "0"); // Ensure fees is string
         netPnl = pnl.netPnl;
         returnPercent = pnl.returnPercent;
         // Auto-close if exit details filled?
         if (validatedData.exitPrice && !validatedData.status) status = "CLOSED";
    }

    // Drizzle doesn't like undefined in values?
    // It ignores them usually if not provided in .set(), but we are constructing an object.
    // Better to build the object.
    
    // ... Actually existingTrade contains all cols.
    
    await db.update(trades)
        .set({
            symbol: validatedData.symbol,
            side: validatedData.side, // if undefined, it won't update? No, partial Zod allows undefined.
            entryDate: validatedData.entryDate,
            entryPrice: validatedData.entryPrice,
            quantity: validatedData.quantity,
            notes: validatedData.notes,
            portfolioId: validatedData.portfolioId,
            exitDate: validatedData.exitDate,
            exitPrice: validatedData.exitPrice,
            fees: validatedData.fees,
            status,
            netPnl,
            returnPercent,
        })
        .where(eq(trades.id, validatedData.id));

    return { success: true };
  });

export const deleteTrade = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
      const data = ctx.data as z.infer<typeof deleteTradeSchema>;
      const session = await auth.api.getSession({
          headers: getRequestHeaders()
      });
      if (!session) throw new Error("Unauthorized");
      
      await db.delete(trades).where(
          and(
              eq(trades.id, data.id),
              eq(trades.userId, session.user.id)
          )
      );
      
      return { success: true };
  });
