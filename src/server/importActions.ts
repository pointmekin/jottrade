import { createServerFn } from '@tanstack/react-start';
import { db } from '@/db';
import { trades } from '@/db/schema';
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { calculatePnL } from '@/lib/finance';

// Schema that matches our DB structure mostly, but allows for bulk array
const importTradeSchema = z.object({
  symbol: z.string().min(1),
  side: z.string(), // "buy" / "sell" -> needs mapping
  entryDate: z.string().or(z.date()),
  entryPrice: z.string().or(z.number()),
  quantity: z.string().or(z.number()),
  
  exitDate: z.string().or(z.date()).optional(),
  exitPrice: z.string().or(z.number()).optional(),
  
  fees: z.string().or(z.number()).optional(),
  
  notes: z.string().optional(), // We will put ticket ID here
});

// @ts-ignore
export const importTrades = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
      const rawData = ctx.data;
      // We expect rawData to be the array directly? or object { trades: [...] }?
      // Let's assume passed as { trades: [...] }
      const input = (rawData?.trades || rawData) as z.infer<typeof importTradeSchema>[];
      
      const session = await auth.api.getSession({
          headers: getRequestHeaders()
      });

      if (!session) {
          throw new Error("Unauthorized");
      }

      const valuesToInsert: typeof trades.$inferInsert[] = [];

      for (const item of input) {
        // Map fields
        const side = item.side.toLowerCase().includes("buy") ? "LONG" : "SHORT";
        
        const entryPriceStr = String(item.entryPrice);
        const exitPriceStr = item.exitPrice ? String(item.exitPrice) : null;
        const quantityStr = String(item.quantity);
        const feesStr = item.fees ? String(item.fees) : "0";

        let netPnl = undefined;
        let returnPercent = undefined;
        let status = "OPEN";

        if (exitPriceStr && entryPriceStr) {
            const pnl = calculatePnL(
                side,
                entryPriceStr,
                exitPriceStr,
                quantityStr,
                feesStr
            );
            netPnl = pnl.netPnl;
            returnPercent = pnl.returnPercent;
            status = "CLOSED";
        }

        valuesToInsert.push({
            userId: session.user.id,
            symbol: item.symbol.toUpperCase(),
            side,
            entryDate: new Date(item.entryDate),
            entryPrice: entryPriceStr,
            quantity: quantityStr,
            
            exitDate: item.exitDate ? new Date(item.exitDate) : null,
            exitPrice: exitPriceStr,
            fees: feesStr,
            
            status,
            netPnl,
            returnPercent,
            notes: item.notes
        });
      }

      if (valuesToInsert.length > 0) {
          await db.insert(trades).values(valuesToInsert);
      }

      return { success: true, count: valuesToInsert.length };
  });
