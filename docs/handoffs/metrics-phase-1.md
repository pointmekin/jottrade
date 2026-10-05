# Performance metrics: phase 1 handoff

> **Historical.** This document records past work. Its instructions are not active, and its file paths and status may be out of date. For the current state, read [README.md](../../README.md), [AGENTS.md](../../AGENTS.md) and [docs/feature-map.md](../feature-map.md).

Issue: [#8](https://github.com/pointmekin/jottrade/issues/8). PR: [#23](https://github.com/pointmekin/jottrade/pull/23), branch `feat/accurate-performance-metrics`. Plan: `docs/plans/performance-metrics.md`. Definitions: `docs/metrics.md`.

## Done in phase 1

- Two curves on `EquityPoint`: `balance` (cash) and `performance` (trading P&L). Drawdown and Sharpe read both. A deposit or a withdrawal never changes trading P&L or drawdown.
- `computeSharpe` returns `{ value, days }` from daily account returns, with `MIN_SHARPE_DAYS = 20`.
- `computePayoffRatio` replaces `computeAvgRR`. The UI no longer says "risk/reward".
- `summarizeGroup` / `summarizeGroups` are the one aggregation. Breakeven is excluded from every win rate. `winRate` is `number | null`.
- `getStrategyPerformance` (in `src/server/strategyActions.ts`) reads every closed trade of one strategy. `StrategyPerformance.tsx` shows it with its scope.
- `getAdvancedAnalytics` reads the same trade set as the headline (`closedTradesInRange`).
- `priceReturnPercent` in `src/lib/finance.ts` is the one return formula for imports and manual trades. The journal column is "Price return".
- `MetricLabel` (`src/components/metric-label.tsx`) shows a definition popover next to a metric label.

## Verification state

- `bunx vitest run`: 25 files, 220 tests pass.
- `bunx tsc --noEmit`: the same 6 errors as `main` (Header.tsx, StrategyForm.tsx x2, StrategyList.tsx, gcp.ts, demo/start.ssr.spa-mode.tsx).
- Biome: only warnings that existed before, in touched files.
- Screenshots: branch `pr-assets/issue-8`, from synthetic data.

## How to take screenshots without real data

The repository is public. Do not screenshot the real account.

1. `createdb -h /tmp <name>`, then `DATABASE_URL=postgresql://$USER@localhost:5432/<name> bunx drizzle-kit push --force`.
2. `@/db` resolves to `src/db.ts`, which uses the Neon HTTP driver. For local Postgres, swap it temporarily to `drizzle-orm/node-postgres` with a `pg` `Pool`. Never commit the swap. Restore the file after the capture.
3. Start `vite dev --port 3000` with `DATABASE_URL` and `BETTER_AUTH_URL=http://localhost:3000` in the environment. `dotenv` does not override them. Only one dev server can run (devtools port 42069).
4. Sign up through `POST /api/auth/sign-up/email` with an `Origin` header, then seed with SQL.
5. Drive Chrome with `playwright-core` from a scratch folder outside the repo, with `executablePath` set to the system Chrome.
6. For a "before" build, use `git worktree add` and a `cp -Rc node_modules` copy. A symlinked `node_modules` breaks Nitro.

Database `jottrade_issue8` on local Postgres still has the phase 1 seed (user `demo@jottrade.test`, password `demo-password-123`).

## Open items for phase 2

1. **Success-signal baseline.** The issue asks for a baseline and a collection approach, not a number. Suggestion: a read-only reconciliation script that compares, per account, the headline totals with the sum of the strategy totals and reports discrepancies.
2. **Account return per trade**: net P&L ÷ balance at entry. It needs the balance at the entry time, which `summarizeTrades` can derive. Decide where to show it: the trade detail page or a journal column.
3. **R-multiple.** It needs a stop price recorded at entry. That is a schema change (a nullable column). Dev and prod share one Neon database, so a local migration changes production at once. Get the owner's approval before any `db:migrate` or `db:push` against `.env`.
4. **Legacy `return_percent`.** The PR body has the idempotent SQL. The owner runs it. Do not run it yourself.
5. **Small gaps.**
   - Trade mutations do not invalidate the `["strategy-performance"]` query. It refetches on mount only.
   - Sharpe stops at the last active day, not at the end of the window.
   - The journal "Price return" header has no in-app definition.
