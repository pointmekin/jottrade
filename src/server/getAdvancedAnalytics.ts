import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trades, strategies, portfolios } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import {
  groupByDay, computeSharpe, computeMaxDrawdown, computeAvgRR, computeAvgHoldTime,
  type ClosedTrade,
} from '@/lib/analytics';

function aggregateGroup(pnls: number[]) {
  if (!pnls.length) return { count: 0, totalPnl: 0, avgPnl: 0, winRate: 0 };
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  return {
    count: pnls.length,
    totalPnl,
    avgPnl: totalPnl / pnls.length,
    winRate: (pnls.filter((p) => p > 0).length / pnls.length) * 100,
  };
}

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const getAdvancedAnalytics = createServerFn({ method: 'GET' })
  .handler(async () => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const [allTrades, allStrategies, userPortfolios] = await Promise.all([
      db.select().from(trades)
        .where(and(eq(trades.userId, session.user.id), eq(trades.status, 'CLOSED')))
        .orderBy(asc(trades.exitDate)),
      db.select().from(strategies).where(eq(strategies.userId, session.user.id)),
      db.select().from(portfolios).where(eq(portfolios.userId, session.user.id)).limit(1),
    ]);

    const initialBalance = userPortfolios[0] ? Number(userPortfolios[0].initialBalance) : 10000;

    const analyticsInput: ClosedTrade[] = allTrades.map((t) => ({
      exitDate: new Date(t.exitDate!),
      entryDate: new Date(t.entryDate),
      netPnl: Number(t.netPnl ?? 0),
    }));

    const dailyPnl = groupByDay(analyticsInput);

    // Risk metrics
    const riskMetrics = {
      sharpe: computeSharpe(dailyPnl),
      maxDrawdown: computeMaxDrawdown(analyticsInput, initialBalance),
      avgRR: computeAvgRR(analyticsInput),
      avgHoldTimeHours: computeAvgHoldTime(analyticsInput),
    };

    // By strategy
    const strategyNameMap = new Map(allStrategies.map((s) => [s.id, s.name]));
    const strategyGroups: Record<string, number[]> = {};
    for (const t of allTrades) {
      const key = t.setupId ? (strategyNameMap.get(t.setupId) ?? 'Unknown') : 'Unassigned';
      if (!strategyGroups[key]) strategyGroups[key] = [];
      strategyGroups[key].push(Number(t.netPnl ?? 0));
    }
    const byStrategy = Object.entries(strategyGroups).map(([name, pnls]) => ({
      name, ...aggregateGroup(pnls),
    }));

    // By symbol (top 10)
    const symbolGroups: Record<string, number[]> = {};
    for (const t of allTrades) {
      if (!symbolGroups[t.symbol]) symbolGroups[t.symbol] = [];
      symbolGroups[t.symbol].push(Number(t.netPnl ?? 0));
    }
    const bySymbol = Object.entries(symbolGroups)
      .map(([name, pnls]) => ({ name, ...aggregateGroup(pnls) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // By day of week (Mon-Fri)
    const dowGroups: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const t of allTrades) {
      const dow = new Date(t.exitDate!).getDay();
      if (dow >= 1 && dow <= 5) dowGroups[dow].push(Number(t.netPnl ?? 0));
    }
    const byDayOfWeek = [1, 2, 3, 4, 5].map((d) => ({
      name: DOW_NAMES[d], ...aggregateGroup(dowGroups[d]),
    }));

    // By entry hour
    const hourGroups: Record<string, number[]> = {};
    for (const t of allTrades) {
      const hour = new Date(t.entryDate).getHours();
      const key = `${hour}:00`;
      if (!hourGroups[key]) hourGroups[key] = [];
      hourGroups[key].push(Number(t.netPnl ?? 0));
    }
    const byHour = Object.entries(hourGroups)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([name, pnls]) => ({ name, ...aggregateGroup(pnls) }));

    return { riskMetrics, byStrategy, bySymbol, byDayOfWeek, byHour };
  });
