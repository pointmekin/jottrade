# Plan: performance metrics, phase 2

Issue: [#8](https://github.com/pointmekin/jottrade/issues/8). Phase 1: `docs/plans/performance-metrics.md`, PR [#23](https://github.com/pointmekin/jottrade/pull/23). Definitions: `docs/metrics.md`.

## Slices in this phase

| # | Slice | Result |
|---|---|---|
| 1 | Query refresh | `invalidateTradeQueries` (`src/lib/trade-queries.ts`) lists every query that reads trades. Create, import, edit and delete call it. Before, create, import and edit did not refresh the dashboard or the strategy page for up to 60 s (`staleTime`). |
| 2 | Sharpe window end | `computeSharpe(curve, endDay)` counts idle weekdays after the last active day up to the end of the period. The server caps the end at today. |
| 3 | Journal header | "Price return" opens a definition popover. |
| 4 | Account return | `computeAccountReturn` and a "Trade returns" section on the trade page. |
| 5 | Success-signal baseline | `scripts/reconcile-metrics.ts`, a read-only reconciliation. |
| 6 | R-multiple | Design only (below). No schema change in this phase. |

## Decisions

1. **Account return is on the trade page only.** The balance at entry needs the full account history. The journal list is paged (50 rows), so a column would need a window query per page. The trade page already loads one trade, so it loads the history once.
2. **Balance at entry** is every deposit, withdrawal, adjustment and closed trade realized before the entry time. A trade that overlaps and closes later is not in it. This uses `summarizeTrades`, so it agrees with the equity curve.
3. **Sharpe start is not changed.** The series still starts at the first active day. For "All time" there is no earlier bound. For a bounded period the balance before the first trade is known, so a later phase can start at the period start. That change needs its own decision, because it lowers Sharpe for a period with a late first trade.
4. **The reconciliation is a script, not a server function.** It reads every account, so it must not be reachable from the app. It uses `pg` in one `BEGIN READ ONLY` transaction, and it does not read `.env`.

## Success signal: baseline and collection

The issue has two signals.

1. **Zero discrepancies.** `scripts/reconcile-metrics.ts` compares, per account:
   - the headline closed-trade count with `COUNT(*)` of closed trades,
   - the headline balance with `SUM(net_pnl)` of closed trades plus `SUM(amount)` of cash flows,
   - each dashboard strategy group with the SQL group that `getStrategyPerformance` reads.

   It also counts legacy return rows (closed trades that store notional return). That count is the size of the legacy SQL in the phase 1 PR.

   Baseline on the synthetic database (`jottrade_issue8`, 187 closed trades): 0 discrepancies, 0 legacy return rows. The production baseline is not collected yet. The owner runs it, because the repository is public and the database is shared.

   Collection: run it after each deploy that touches `src/lib/analytics.ts` or `src/server/`, and record the result in the table in the phase 2 handoff. The exit code is 1 on any discrepancy, so it can also run in CI against a seeded database.

2. **Fewer user questions about differing totals.** JotTrade is a personal tool, so a "question" is a report by the owner. Proposal: open a GitHub issue with the label `metrics-mismatch` for each report. The baseline is the count of such reports before #8. The label does not exist yet. The owner decides whether to create it.

## R-multiple design (not applied)

R-multiple = net P&L ÷ initial risk. Initial risk is the loss at the initial stop. The journal has no stop, so this needs a schema change.

### Schema and migration

```ts
// src/db/schema.ts, after targetPrice
stopPrice: numeric("stop_price"),
```

```sql
-- drizzle/0007_<name>.sql, from `npm run db:generate`
ALTER TABLE "trades" ADD COLUMN "stop_price" numeric;
```

- It is the same shape as `0006` (`target_price`). A nullable column without a default is a metadata-only change in Postgres. It does not rewrite the table.
- Legacy rows stay `NULL`. There is no backfill. The issue excludes speculative backfill of risk data.

### Rollout order

Dev and prod share one Neon database, and Vercel builds `main` without a migration step.

1. The owner applies the migration. The deployed build keeps working, because Drizzle selects columns by name and ignores a new one.
2. Merge and deploy the code that reads `stop_price`.

The reverse order breaks production: the new build selects a column that does not exist. Recovery: revert the code first, then `ALTER TABLE "trades" DROP COLUMN "stop_price";`. The drop loses every recorded stop, so export the column before.

### Capture

| Path | Change |
|---|---|
| `TradeEntryForm` | An optional "Initial stop" input next to the target. It uses `register()`, so the form keeps `"use no memo"`. |
| Trade page (`TradeDetailSheet`) | The same input. An edit corrects a typo. It does not trail the stop. |
| `createTrade` / `updateTrade` | Zod: positive; below entry for a long, above entry for a short. |
| Command palette | `commandIntentActions.ts` tells the model to ignore a stop. Change it to extract `stopPrice`. |
| Exness import | The Exness export has a `stop_loss` column, but it holds the stop at close. A trailed stop gives a wrong R. **Owner decision:** map it, or leave imports without a stop. |

### Formula

- Initial risk in account currency = the loss if the trade closed at the stop: `-calculateInstrumentPnL({ ...trade, exitPrice: stopPrice, feesAccount: 0 }).netPnl`. It reuses the contract size and the FX conversion of the P&L.
- R = net P&L ÷ initial risk. Net P&L includes fees, so a trade that exits at the stop shows slightly below −1R.
- The value is `null` without a stop, for a trade that is not closed, or when the risk is not positive.

### UI states

| Place | Value | Unavailable text |
|---|---|---|
| Trade page, "R-multiple" cell | `+1.80R` | "No initial stop recorded" / "Trade is not closed" |
| Dashboard, "Avg R" card | mean R of trades with a stop | "—" with "No trade has a stop"; the sub-line always shows "12 of 187 trades have a stop" |
| Payoff ratio card | unchanged | The definition text stops saying that R is not available. |

The dashboard shows Avg R from 1 trade with a stop, with the sample. Payoff ratio stays, because most legacy trades have no stop.

### Tests

- `computeRMultiple`: long, short, a non-USD quote (FX), fees below −1R, no stop, an open trade, a stop on the wrong side.
- Zod: a stop on the wrong side fails for a long and for a short.
- `RiskMetrics`: Avg R with a partial sample, and with no stop.
- The trade entry form saves and clears the stop.

### Estimate

2–3 developer-days after the migration: schema and validation 0.5, capture paths 1, metrics and UI 1, docs and screenshots 0.5.
