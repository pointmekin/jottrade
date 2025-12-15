import { createServerFn } from '@tanstack/react-start';
import { db } from '@/db';
import { trades } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
// import { getWebRequest } from 'vinxi/http';
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from '@/lib/auth';

// @ts-ignore
export const getTrades = createServerFn({ method: "GET" })
  .handler(async (ctx: any) => {
    const data = (ctx.data || {}) as { portfolioId?: number };
    // const request = getWebRequest();
    const session = await auth.api.getSession({
        headers: getRequestHeaders()
    });
    
    if (!session) {
      throw new Error("Unauthorized");
    }

    // specific portfolio or default one?
    
    let queryCondition = eq(trades.userId, session.user.id);
    
    if (data?.portfolioId) {
        queryCondition = and(
            eq(trades.userId, session.user.id),
            eq(trades.portfolioId, data.portfolioId)
        )!;
    }

    const userTrades = await db.select()
      .from(trades)
      .where(queryCondition)
      .orderBy(desc(trades.entryDate));

    return userTrades as any[];
  });
