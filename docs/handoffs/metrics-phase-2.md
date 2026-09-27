# Performance metrics: phase 2 handoff

Issue: [#8](https://github.com/pointmekin/jottrade/issues/8). Phase 1: PR [#23](https://github.com/pointmekin/jottrade/pull/23). Phase 2 branch: `feat/metrics-phase-2`. Plan: `docs/plans/performance-metrics-phase-2.md`. Definitions: `docs/metrics.md`.

## Done in phase 2

- `invalidateTradeQueries` (`src/lib/trade-queries.ts`) refreshes every query that reads trades, `["strategy-performance"]` included. Create, import, edit, delete, account delete and the command palette call it.
- `computeSharpe(curve, endDay)` counts idle weekdays up to the end of the period, capped at today.
- The journal "Price return" header has a definition popover. `MetricLabel` takes a `className`.
- `computeAccountReturn` in `src/lib/analytics.ts`. `getTradeById` returns `accountReturn`. `TradeReturns` (`src/components/journal/trade-returns.tsx`) shows price return and account return on the trade page.
- `reconcileAccount` (`src/lib/reconciliation.ts`) and `scripts/reconcile-metrics.ts`: a read-only reconciliation for the success signal.
- The R-multiple design is in the plan. No schema change was made.

## Verification state

- `bunx vitest run`: 28 files, 233 tests pass.
- `bunx tsc --noEmit`: the same 6 errors as `main`.
- Biome: no new diagnostics in touched files. The `any` warnings and the format error in `delete-account-dialog.test.tsx` existed before.
- Screenshots: branch `pr-assets/issue-8-phase-2`, from synthetic data.

## Reconciliation baseline

Run: `DATABASE_URL=<url> bunx tsx scripts/reconcile-metrics.ts`. It does not read `.env`.

| Date | Database | Accounts | Discrepancies | Legacy return rows |
|---|---|---|---|---|
| 2026-09-27 | local `jottrade_issue8` (synthetic) | 1 | 0 | 0 |
| — | production | not run | — | — |

Add a row each time the script runs.

## Screenshot data

- `jottrade_issue8`: the phase 1 seed, unchanged.
- `jottrade_issue8_p2`: a copy with every trade and cash flow from 2026-09-12 removed. The pause shows the Sharpe window end: 140 days before, 150 after. Trade 175 is the trade page example.
- The steps in `docs/handoffs/metrics-phase-1.md` still apply. Copy `node_modules` into a new worktree with `cp -Rc`.

## Open items

1. **Owner decisions.**
   - Apply the `stop_price` migration (plan: "Rollout order"). Then implement R-multiple.
   - Map the Exness `stop_loss` column at import, or leave imports without a stop.
   - Create a `metrics-mismatch` label for reports of differing totals.
   - Run the reconciliation script on production and add the result to the table above.
   - Run the legacy `return_percent` SQL from PR #23. The script reports how many rows it changes.
2. **Sharpe start.** The series starts at the first active day. A bounded period could start at the period start. See plan decision 3.
3. **Cash flow changes and the trade page.** `AccountEntriesPanel` does not invalidate `["trade"]`, so the account return can be old for up to 60 s after a deposit edit.
