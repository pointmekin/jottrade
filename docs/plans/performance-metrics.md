# Plan: accurate, consistently scoped, explainable performance metrics

> **Historical.** This document records past work. Its instructions are not active, and its file paths and status may be out of date. For the current state, read [README.md](../../README.md), [AGENTS.md](../../AGENTS.md) and [docs/feature-map.md](../feature-map.md).

Issue: [#8](https://github.com/pointmekin/jottrade/issues/8). Baseline commit: `65383aa`.

## Reproduced gaps

Each gap has a failing test in `src/test/analytics.test.ts` before the fix.

| # | Gap | Cause |
|---|-----|-------|
| 1 | A withdrawal shows as a drawdown. | `computeMaxDrawdown` reads the cash balance curve. |
| 2 | "Avg risk/reward" is avg win ÷ avg loss. It shows `0.00x` with no loss. | `computeAvgRR` returns `0` for "not available". |
| 3 | Sharpe divides cash P&L, not returns. It shows `0.00` for 1 day of data. | `computeSharpe` reads `groupByDay` cash totals and returns `0` for "not available". |
| 4 | The strategy summary counts only the first 50 trades and prints `$`. | `StrategyForm` reads page 1 of `getTrades`. |
| 5 | The dashboard strategy chart counts breakeven trades as losses. The headline win rate excludes them. | `aggregateGroup` divides by all trades. |
| 6 | The dashboard strategy chart merges two strategies with the same name. | `byStrategy` groups by name. |
| 7 | The headline counts a closed trade without an exit date. The risk section does not. | `getAdvancedAnalytics` filters `exitDate IS NOT NULL` in SQL. |
| 8 | Imported trades store price return. Manual trades store net P&L ÷ entry notional. The journal labels both "ROI". | `importActions.ts` and `finance.ts` use different formulas. |

## Decisions

1. **Two curves.** Each `EquityPoint` has `balance` (cash) and `performance` (cumulative trading P&L in the window). Trading P&L is closed-trade net P&L plus broker adjustments (swaps, dividends). Deposits and withdrawals change `balance` only.
2. **Drawdown** measures trading losses. A cash flow moves the peak by the same amount, so a deposit or a withdrawal never creates or hides a drawdown. The percent divides by the flow-adjusted peak balance. It is `null` when that peak is not positive.
3. **Sharpe** uses daily account returns: `day P&L ÷ (previous balance + same-day cash flows)`.
   - Eligible days: every weekday from the first to the last active day, plus active weekend days. An idle weekday counts as a zero return.
   - A day with no positive capital is not eligible.
   - Annualization: `√252`, risk-free rate 0, sample standard deviation.
   - The value is `null` below 20 eligible days or with zero variance. The UI shows the day count.
   - It is a realized-P&L Sharpe. Open positions are not marked to market, so the label says "realized".
4. **Payoff ratio** replaces "Avg risk/reward". It is `null` without at least one win and one loss. R-multiple needs a recorded initial stop, and the schema has no stop column. The app does not show R until a later phase captures the stop.
5. **Win rate** is wins ÷ (wins + losses). Breakeven trades are excluded from the denominator on every screen. With no decided trade the value is `null`.
6. **Strategy performance** is calculated on the server over all closed trades of the active account. `summarizeGroup` is the one aggregation for the dashboard chart and the strategy page. The strategy page states its scope: all time, account, currency.
7. **Return** is one quantity: price return, the signed percent move from entry to exit. Imports and manual entries use the same `priceReturnPercent` helper. The journal labels it "Price return". Notional return and account return are documented in `docs/metrics.md`, not shown.
8. **Unavailable is not zero.** Every derived metric that can be undefined returns `null`, and the UI shows `—` with a reason.

## Data contracts

- `EquityPoint`: adds `performance: number`.
- `TradeStats.winRate`: `number | null`.
- `getAdvancedAnalytics().riskMetrics`: `{ sharpe: { value, days }, maxDrawdown: { dollars, percent | null }, payoff: { ratio | null, avgWin, avgLoss, wins, losses }, avgHoldTimeHours: number | null, closedTrades }`.
- `byStrategy`, `bySymbol`, `byDayOfWeek`, `byHour`: `GroupSummary` with a nullable `winRate`.
- New `getStrategyPerformance({ portfolioId, strategyId })` in `strategyActions.ts`.

No schema change. No migration.

## Legacy data and rollout

Manual trades saved before this change store notional return in `return_percent`. New and edited manual trades store price return. The recompute SQL below is idempotent. The owner runs it once after deploy. It is not run by this change because dev and prod share one database.

```sql
UPDATE trades
SET return_percent = ROUND(
  (exit_price - entry_price) / entry_price * 100
  * CASE WHEN side = 'SHORT' THEN -1 ELSE 1 END, 2)
WHERE import_hash IS NULL
  AND status = 'CLOSED'
  AND entry_price IS NOT NULL AND entry_price <> 0
  AND exit_price IS NOT NULL;
```

Recovery: the old value is derivable again from `calculatePnL` on the stored prices.

## Slices

1. Analytics core: two curves, drawdown, Sharpe, payoff ratio, `summarizeGroup`, nullable win rate. Tests first.
2. Server: `getAdvancedAnalytics` on one trade set; `getStrategyPerformance`.
3. UI: `RiskMetrics` with definitions and sample sizes, equity curve toggle, strategy summary, journal label.
4. Return formula: shared `priceReturnPercent`.
5. Docs: `docs/metrics.md`.

Verification: Vitest, Biome on touched files, `tsc` baseline, and screenshots on a local database with synthetic history.

## Success signal

The reconciliation test in `src/test/analytics.test.ts` asserts zero discrepancies between the strategy totals and the headline totals on a 60-trade fixture. User questions about differing totals have no baseline yet; the next phase defines one.

## Out of scope

New charts, live mark-to-market, R-multiple capture, account return per trade, backfill of missing risk data.
