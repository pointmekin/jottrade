import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { portfolios, trades } from '@/db/schema';
import { DEFAULT_INITIAL_BALANCE, summarizeTrades } from '@/lib/analytics';
import { auth } from '@/lib/auth';

export const getAnalytics = createServerFn({ method: "GET" })
  .handler(async () => {
    const session = await auth.api.getSession({
        headers: getRequestHeaders()
    });

    if (!session) {
      throw new Error("Unauthorized");
    }

    const userId = session.user.id;

    const [userTrades, userPortfolios] = await Promise.all([
      db.select().from(trades).where(eq(trades.userId, userId)),
      db.select().from(portfolios)
        .where(eq(portfolios.userId, userId))
        .orderBy(desc(portfolios.isDefault), asc(portfolios.id))
        .limit(1),
    ]);

    const initialBalance = userPortfolios[0]
      ? Number(userPortfolios[0].initialBalance)
      : DEFAULT_INITIAL_BALANCE;

    return summarizeTrades(
      userTrades.map((trade) => ({
        status: trade.status,
        entryDate: trade.entryDate,
        exitDate: trade.exitDate,
        netPnl: Number(trade.netPnl ?? 0),
      })),
      initialBalance
    );
  });
