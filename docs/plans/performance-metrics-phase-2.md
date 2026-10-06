# Plan: performance metrics, phase 2

> **Historical.** This document records past work. Its instructions are not active, and its file paths and status may be out of date. For the current state, read [README.md](../../README.md), [AGENTS.md](../../AGENTS.md) and [docs/feature-map.md](../feature-map.md).

Issue: [#8](https://github.com/pointmekin/jottrade/issues/8). Phase 1: `docs/plans/performance-metrics.md`, PR [#23](https://github.com/pointmekin/jottrade/pull/23). Definitions: `docs/metrics.md`.

## Slices in this phase

| # | Slice | Result |
|---|---|---|
| 1 | Query refresh | `invalidateTradeQueries` (`src/lib/query-keys.ts`) lists every query that reads trades. Create, import, edit and delete call it. Before, create, import and edit did not refresh the dashboard or the strategy page for up to 60 s (`staleTime`). |
| 2 | Sharpe window end | `computeSharpe(curve, endDay)` counts idle weekdays after the last active day up to the end of the period. The server caps the end at today. |
| 3 | Journal header | "Price return" opens a definition popover. |
| 4 | Account return | `computeAccountReturn` and a "Trade returns" section on the trade page. |
| 5 | Success-signal baseline | `scripts/reconcile-metrics.ts`, a read-only reconciliation. |
| 6 | R-multiple | The original design was deferred in phase 2. Issue #9 implements the saved original-plan contract described below. |

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

   Collection: run it after each deploy that touches `src/lib/analytics.ts`, `src/lib/risk-metrics.ts`, `src/lib/group-summary.ts` or `src/server/`, and record the result in the table in the phase 2 handoff. The exit code is 1 on any discrepancy, so it can also run in CI against a seeded database.

2. **Fewer user questions about differing totals.** JotTrade is a personal tool, so a "question" is a report by the owner. Proposal: open a GitHub issue with the label `metrics-mismatch` for each report. The baseline is the count of such reports before #8. The label does not exist yet. The owner decides whether to create it.

## R-multiple implementation in issue #9

The earlier single-stop-column design is superseded by a saved original plan. `src/lib/trade-risk.ts` calculates price-distance risk before costs using the entry-time conversion. It never estimates original risk by pretending the trade exited at the stop. `docs/metrics.md` defines initial risk, planned RR and realized net R.

The additive nullable trade fields are `initialStopPrice`, `initialTargetPrice`, `initialRiskAmount`, `initialRiskPercent`, `initialRiskSnapshot`, `managementStopPrice` and `riskCorrectionHistory`. The snapshot saves prices, original quantity, contract specification, currencies, entry FX, reviewed balance and their sources. Legacy rows remain null. An import's stop at close is not treated as the original stop.

Manual entry, reviewed command capture and the instrument-aware calculator use the same capture schema. The calculator opens the existing journal drawer for review and keeps the account bound to the draft. Details show the saved plan, planned RR, realized net R and correction history. Current management edits preserve the original denominator. Explicit original-plan corrections use an atomic revision check and append before/after history. Imported execution corrections remain in import reconciliation.

Manual closed-trade P&L has separate `exitQuoteToAccountRate` and `pnlCalculationSnapshot` fields. A required external exit rate must be reviewed for the actual exit date. Entry risk FX is never substituted for it. Broker net P&L and import provenance remain unchanged by risk-only correction.

R is shown on trade details only. Dashboard average R and speculative legacy backfill are outside this implementation.

The coordinator generates one combined additive migration for issues #9, #10 and #11. Apply it before deploying code that selects the new columns. If application rollback is needed, keep the additive columns and correction history so recorded plans survive. No migration or live database changes are performed by the issue #9 implementation chat.
