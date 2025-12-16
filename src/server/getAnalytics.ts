import { createServerFn } from '@tanstack/react-start';
import { db } from '@/db';
import { trades, portfolios } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from '@/lib/auth';
import { format } from 'date-fns';

export const getAnalytics = createServerFn({ method: "GET" })
  .handler(async (_ctx: any) => {
    const session = await auth.api.getSession({
        headers: getRequestHeaders()
    });
    
    if (!session) {
      throw new Error("Unauthorized");
    }

    const userId = session.user.id;

    // Fetch all trades for calculation
    // Ordering by date asc for cumulative chart
    const userTrades = await db.select()
      .from(trades)
      .where(eq(trades.userId, userId))
      .orderBy(asc(trades.entryDate));

    // Fetch portfolio for initial balance (taking the first one for now or default)
    // In a real multi-portfolio app, we'd filter by portfolioId
    const userPortfolios = await db.select().from(portfolios).where(eq(portfolios.userId, userId)).limit(1);
    const initialBalance = userPortfolios.length > 0 ? Number(userPortfolios[0].initialBalance) : 10000; // Default 10k if not set

    // Stats Calculation
    let totalTrades = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalPnL = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let activeTrades = 0;

    const equityCurve: { date: string; balance: number }[] = [];
    let currentBalance = initialBalance;
    
    // Add initial point
    // equityCurve.push({ date: 'Start', balance: currentBalance });

    // Group by day for the chart? Or just every trade?
    // Let's do every trade for granularity, or daily close if too many. 
    // For simplicity, let's map every closed trade to a point.
    
    for (const trade of userTrades) {
        if (trade.status === 'OPEN') {
            activeTrades++;
            continue;
        }

        const pnl = Number(trade.netPnl || 0);
        totalTrades++;
        totalPnL += pnl;
        currentBalance += pnl;

        if (pnl > 0) {
            winCount++;
            grossProfit += pnl;
        } else {
            lossCount++;
            grossLoss += Math.abs(pnl); // Gross loss should be positive magnitude
        }

        // Add to curve
        if (trade.exitDate) {
            equityCurve.push({
                date: format(new Date(trade.exitDate), 'yyyy-MM-dd'),
                balance: currentBalance
            });
        }
    }

    // Win Rate
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

    // Profit Factor
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 999 : 0);

    return {
        stats: {
            totalBalance: currentBalance,
            totalPnL: totalPnL,
            activeTrades: activeTrades,
            winRate: winRate,
            profitFactor: profitFactor,
            totalTrades: totalTrades
        },
        equityCurve: equityCurve
    };
  });
