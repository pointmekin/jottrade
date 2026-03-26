export type ClosedTrade = {
  exitDate: Date;
  entryDate: Date;
  netPnl: number;
};

/**
 * Groups closed trades by exit date (YYYY-MM-DD UTC). Returns date → sum of netPnl.
 * Note: uses UTC date from exitDate — trades stored with UTC timestamps will group correctly.
 */
export function groupByDay(trades: ClosedTrade[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const trade of trades) {
    const key = trade.exitDate.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + trade.netPnl);
  }
  return map;
}

/**
 * Annualized Sharpe ratio from a series of P&L values.
 * Risk-free rate = 0. Annualization = sqrt(252).
 * Uses sample stddev (n-1). Returns 0 if fewer than 2 values or stddev is 0.
 */
export function computeSharpe(dailyPnl: Map<string, number>): number {
  const values = Array.from(dailyPnl.values());
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Use sample stddev (n-1) — required for unbiased Sharpe ratio estimation
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return 0;
  return (mean / stddev) * Math.sqrt(252);
}

/**
 * Largest peak-to-trough drawdown from trades sorted by exitDate asc.
 * IMPORTANT: trades must be pre-sorted by exitDate ascending.
 * Returns { dollars, percent }.
 */
export function computeMaxDrawdown(
  trades: ClosedTrade[],
  initialBalance: number
): { dollars: number; percent: number } {
  let peak = initialBalance;
  let balance = initialBalance;
  let maxDd = 0;
  let maxDdPct = 0;
  for (const trade of trades) {
    balance += trade.netPnl;
    if (balance > peak) peak = balance;
    const dd = peak - balance;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDd) { maxDd = dd; maxDdPct = ddPct; }
  }
  return { dollars: maxDd, percent: maxDdPct };
}

/** Avg win / |avg loss| across closed trades. Returns 0 if no wins or no losses. */
export function computeAvgRR(trades: ClosedTrade[]): number {
  const wins = trades.filter(t => t.netPnl > 0);
  const losses = trades.filter(t => t.netPnl < 0);
  if (!wins.length || !losses.length) return 0;
  const avgWin = wins.reduce((a, t) => a + t.netPnl, 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((a, t) => a + t.netPnl, 0) / losses.length);
  return avgLoss === 0 ? 0 : avgWin / avgLoss;
}

/** Mean hold duration in hours across closed trades. */
export function computeAvgHoldTime(trades: ClosedTrade[]): number {
  if (!trades.length) return 0;
  const totalHours = trades.reduce(
    (acc, t) => acc + (t.exitDate.getTime() - t.entryDate.getTime()) / 3_600_000,
    0
  );
  return totalHours / trades.length;
}
