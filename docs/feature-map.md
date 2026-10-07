# Feature map

This map lists the supported product features, where each one starts, which code owns its data, and how each one is verified today. It describes `main` after PR #46, with the verification added for issue #31 and the onboarding change.

Update this file in the same pull request when you add, remove or change a route, an entry point, a user flow, a server module or the verification of a feature.

## How to read the verification column

- **Unit**: runs in `npm run test` with no database. It always runs in CI through `npm run quality`.
- **DB (optional)**: runs only when its environment variable points to a disposable local PostgreSQL database. Without the variable, Vitest skips it. CI does not set these variables, so CI skips them.
  - `INTEGRATION_TEST_DATABASE_URL` → `src/test/feature-integration.test.ts` (cross-feature: risk, imports, reviews, account isolation).
  - `IMPORT_TEST_DATABASE_URL` → `src/test/import-sql.integration.test.ts`.
  - `REVIEW_TEST_DATABASE_URL` → `src/test/review-database.test.ts`.
  - Gap: the fixtures accept only `127.0.0.1` with fixed ports, users and database names (for example port `49485`, database `integration_behavior`). They do not accept the `jottrade_test_*` databases that `npm run db:reset` creates ([development-database.md](development-database.md)), so `npm run verify` does not run them.
- **DB (verify)**: `src/test/user-isolation.integration.test.ts`. `npm run verify` runs it on a fresh, seeded `jottrade_test_*` database through the real `@/db` client. CI runs it in the **E2E** check. Without `VERIFY_DATABASE_URL`, Vitest skips it.
- **E2E**: a Playwright spec in `e2e/`. `npm run verify` runs the suite against the production build and the seeded database. CI runs it in the **E2E** check. See [quality-gate.md](quality-gate.md), section "Critical-flow verification".
- **Gap**: no automated check exists.

To run one file: `npx vitest run src/test/<file>`.

## Routes

| Route | File | Access | Notes |
|---|---|---|---|
| `/` | `src/routes/index.tsx` | Public | Landing page with links to sign-up and sign-in. No sidebar. |
| `/sign-in`, `/sign-up` | `src/routes/_unauthenticated/` | Public | Email/password and Google. No sidebar. |
| `/dashboard` | `src/routes/_authenticated/dashboard.tsx` | Signed in | Search: `period`, `from`, `to`. |
| `/journal` | `src/routes/_authenticated/journal.tsx` | Signed in | Search: `view`, `page`, filters, `period`, `dateFrom`, `dateTo`, `intent=log` (`src/lib/journal-search.ts`). |
| `/journal/$tradeId` | `src/routes/_authenticated/journal_.$tradeId.tsx` | Signed in | Trade detail page. |
| `/calendar` | `src/routes/_authenticated/calendar.tsx` | Signed in | Search: `year`, `month`. |
| `/strategies` | `src/routes/_authenticated/strategies.tsx` | Signed in | |
| `/reviews` | `src/routes/_authenticated/reviews.tsx` | Signed in | Search: `kind` (`daily`/`weekly`), `day`, `start`, `account`. |
| `/settings` | `src/routes/_authenticated/settings.tsx` | Signed in | `ssr: false`. |
| `/profile` | `src/routes/profile.tsx` | Checks the session in the page | Outside `_authenticated`; shows "Access Denied" without a session. |
| `/api/auth/*` | `src/routes/api/auth/$.ts` | Public | Better Auth handler (GET, POST). |

The `_authenticated` guard (`src/routes/_authenticated/route.tsx`) runs on the client. The server renders a spinner, then the client redirects to `/sign-in` when there is no session.

## Global entry points

- **Navigation**: `src/lib/nav-items.ts` feeds the desktop sidebar (`app-sidebar.tsx`) and the mobile bottom nav (`bottom-nav.tsx`). Order: Dashboard, Journal, Calendar, Strategies, Reviews, Settings. Verified: Unit `nav-items.test.ts`, `app-sidebar.test.tsx` (navigates on primary mouse-down).
- **Account switcher**: in the sidebar and the mobile drawer (`src/components/account/account-switcher.tsx`). The active account is kept in local storage (`jottrade.active-accounts`, `src/lib/account-store.ts`). Verified: Unit `app-sidebar.test.tsx`.
- **Command palette**: `Cmd+K` / `Ctrl+K` (`src/hooks/use-command-shortcut.ts`), or the command button in the sidebar and bottom nav. Commands (`src/lib/commands/registry.ts`): go to each nav page, log a trade, add a deposit, add a withdrawal, change the theme. Free text is parsed locally; `GEMINI_API_KEY` enables an optional Gemini fallback (`src/server/commandIntentActions.ts`). Dictation uses the browser speech API. Verified: Unit `commands.test.ts`, `command-intent.test.ts`, `command-intent-server.test.ts`, `command-palette.test.tsx`, `command-palette-fallback.test.tsx`, `command-palette-speech.test.tsx`, `command-preview.test.tsx`.

## Features

### Authentication

- **Entry**: `/sign-in`, `/sign-up`; protected routes redirect to `/sign-in`.
- **Flows**: email/password sign-up and sign-in; Google sign-in (`authClient.signIn.social`).
- **Code**: `src/lib/auth.ts` (server, Drizzle adapter), `src/lib/auth-client.ts`, `src/routes/api/auth/$.ts`. Server functions call `requireUserId()` from `src/lib/auth.ts`.
- **Data**: `user`, `session`, `account` (OAuth link, not a trading account), `verification` in `src/db/trading-schema.ts`. Better Auth owns them.
- **Verification**: E2E `auth.spec.ts` (redirect of a signed-out visitor, sign-in that survives a reload, wrong password, another user's trade URL shows "Journal entry not found"). DB (verify) `user-isolation.integration.test.ts`. Gap: sign-up and Google sign-in. DB (optional) `feature-integration.test.ts` and `review-database.test.ts` reject foreign users and unauthenticated calls.

### Trading accounts

- **Entry**: Settings → Trading accounts (`src/components/settings/TradingAccounts.tsx`); account switcher.
- **Flows**: create and edit an account (real/demo kind, description, reporting currency); delete with a typed-name confirmation; switch the active account. Every journal, dashboard, calendar, strategy and review query reads the active account.
- **Server**: `src/server/portfolioActions.ts` (`getAccounts`, `createAccount`, `updateAccount`, `deleteAccount`). `getAccounts` creates a default account on first read (a write inside a GET; issue #33).
- **Data**: `portfolios`; queries in `src/db/portfolios.ts`.
- **Verification**: Unit `delete-account-dialog.test.tsx`, `app-sidebar.test.tsx`. DB (optional) `review-database.test.ts` (account deletion cascades review links), `feature-integration.test.ts` (account isolation). DB (verify) `user-isolation.integration.test.ts` (another user cannot read, edit or delete an account). E2E `accounts.spec.ts` (switch the account; the journal follows and the choice survives a reload). Gap: create and edit.

### First-run onboarding (issue #14)

- **Entry**: the checklist card at the top of `/dashboard` (`src/components/onboarding/onboarding-checklist.tsx`). Settings → "Setup guide" shows it again after a dismissal.
- **Flows**: four steps, each derived from real data: account set up (a review timezone is saved, or the user has a trade), opening deposit recorded, first trade added, first daily review completed. Each step links to the screen that does the work; "Set up account" opens `first-account-dialog.tsx` (name, broker, currency, timezone). The card hides itself when all steps are done or when the user dismisses it. Empty states with one primary button: journal, calendar and reviews (no trades yet, `first-trade-empty-state.tsx`), strategies (no strategies, `StrategyList.tsx`) and the dashboard equity curve.
- **Server**: `src/server/onboardingActions.ts` (`getOnboarding`, `setOnboardingDismissed`, `setupFirstAccount`). `setupFirstAccount` creates the default account when the user has none, and otherwise finishes the setup of the existing default account. It does not use `getAccounts`. The broker is stored in the account description. Logic in `src/lib/onboarding.ts`.
- **Data**: reads `portfolios`, `cash_flows`, `trades`, `review_periods`. Writes `user_onboarding` (only the dismissal time) and, in `setupFirstAccount`, `portfolios`.
- **Verification**: Unit `onboarding.test.ts` (step derivation and input schema), `onboarding-checklist.test.tsx`. E2E `onboarding.spec.ts` (Nora sets up the account from the checklist and sees 1 of 4 steps done, also after a reload). DB (optional) `onboarding-actions.test.ts` with `ONBOARDING_TEST_DATABASE_URL` set to any local database; it uses temporary tables and leaves real tables unchanged. Gap: sample data is not built.

### Journal (manual trades, funding and adjustments)

- **Entry**: `/journal`; "Log trade" drawer (`log-trade-drawer.tsx`, also `/journal?intent=log`); command palette "Log trade"; row click → `/journal/$tradeId`.
- **Flows**:
  - Filter by symbol, side, status, strategy, confidence, mistake and period; page through results. Tabs: All entries, Trades, Adjustments, Funding.
  - Log a trade (`TradeEntryForm.tsx`), edit it and delete it from the detail page (`TradeDetailSheet.tsx`, `DeleteTradeDialog.tsx`).
  - Edit rules: a blank optional price, rate or fee is stored as "no value" (blank fees as 0), so an open trade stays open with no P&L. A closed trade cannot clear its exit price; enter the corrected exit price instead (`src/lib/trade-update.ts`).
  - Add, edit and delete deposits, withdrawals and adjustments (`AccountEntriesPanel.tsx`, `account-entry-form.tsx`).
  - Upload and delete trade screenshots (`trade-images.tsx`). This needs the `GCP_*` variables (`src/lib/gcp.ts`).
  - The detail page shows price return and account return (`trade-returns.tsx`).
- **Server**: `getTrades.ts` (`getTrades`, `getTradeById`), `tradeActions.ts` (`createTrade`, `updateTrade`, `deleteTrade`), `cashFlowActions.ts`, `imageActions.ts`.
- **Data**: `trades`, `cash_flows` (`cashFlows`).
- **Verification**: Unit `journal-table.test.tsx`, `journal-entries.test.ts`, `filter-bar.test.tsx`, `delete-trade-dialog.test.tsx`, `trade-returns.test.tsx`, `finance.test.ts`, `instruments.test.ts`, `date.test.ts`, `period.test.ts`, `trade-target.test.ts`, `trade-blank-decimals.test.ts` (blank fields and the closed-trade exit rule, through `createTrade` and `updateTrade` with a mocked database). E2E `trades.spec.ts` (log, edit and delete a trade; each change survives a reload). DB (verify) `user-isolation.integration.test.ts` (another user cannot read, create, edit, move or delete trades and cash flows). Gap: screenshot upload; funding and adjustment entries in the browser.

### Trade risk and R-multiples (PR #35)

- **Entry**: risk fields in the trade form, the command palette trade preview and the setup calculator on the dashboard (`trade-risk-fields.tsx`); "Correct initial risk" on the trade detail page (`trade-risk-correction-form.tsx`, `trade-risk-details.tsx`).
- **Flows**: capture the original stop and risk at entry; show planned reward/risk and realized net R for closed trades. Management edits keep the original denominator. A correction is revision-checked and stores a reason and the previous plan. Missing original risk stays unknown; it is never guessed.
- **Server**: `tradeActions.ts` (capture), `tradeRiskActions.ts` (`correctTradeInitialRisk`). Logic: `src/lib/trade-risk.ts`, `src/lib/trade-risk-schema.ts`, `src/lib/trade-capture.ts`.
- **Data**: risk columns on `trades`.
- **Verification**: Unit `trade-risk.test.ts`, `trade-risk-actions.test.ts`, `trade-risk-capture.test.tsx`. DB (optional) `feature-integration.test.ts`.

### Imports with reconciled batches and undo (PR #37)

- **Entry**: Journal → "Import CSV" (`import-dialog.tsx`). Tabs: Trade history CSV (Exness), Adjustment CSV, Import history.
- **Flows**:
  - Upload → stage → preview. The preview pins the target account, shows insert/duplicate/superseded/adopt decisions, blocks malformed rows until you repair or exclude them, and asks you to choose when a row matches more than one existing trade (`import-preview.tsx`, `import-row-editor.tsx`, `import-risk-effect.tsx`).
  - Commit → receipt with expected and actual account effects (`import-batch-receipt.tsx`).
  - Import history → batch detail → undo preview → undo (`import-history.tsx`, `import-batch-detail.tsx`). Undo skips records with later notes, risk, screenshots or review references, and says why.
- **Server**: `importActions.ts` (`stageImport`, `repairImportRow`, `commitImport`, `getImportHistory`, `getImportBatch`, `getImportUndoPreview`, `undoImportBatch`). SQL in `src/db/import-*.ts`. Logic in `src/lib/import-*.ts`, `trade-import.ts`, `adjustment-import.ts`, `reconciliation.ts`.
- **Data**: `import_batches`, `import_identities`; import fields on `trades` and `cash_flows`. Migration `drizzle/0007_absent_killraven.sql`.
- **Verification**: Unit `trade-import.test.ts`, `adjustment-import.test.ts`, `adjustment-export.test.ts`, `import-date.test.ts`, `import-domain.test.ts`, `import-preview.test.tsx`, `reconciliation.test.ts`. DB (optional) `import-sql.integration.test.ts`, `feature-integration.test.ts`. E2E `import.spec.ts` (import a synthetic Exness trade CSV, then import it again: the preview shows duplicates and no trade is added). Gap: native sanitized Exness samples, adjustment CSV, undo in the browser, and the hosted Neon transport (release checks listed in PR #37). Issue #10 tracks known import gaps; the suite does not treat them as correct.

### Daily and weekly reviews (PR #36)

- **Entry**: `/reviews`; review timezone and week start in Settings (`review-preferences.tsx`); the trade annotation on the trade detail page (`trade-review-annotation.tsx`).
- **Flows**: choose daily or weekly and a date; set preferences first if none exist; write the review with autosave and conflict recovery (`review-editor.tsx`, `use-review-autosave.ts`); complete and reopen a period; work through the unreviewed trade queue (`review-trade-queue.tsx`). Completed reviews freeze their source facts; later changes show as discrepancies, including import changes (`review-import-changes.tsx`).
- **Server**: `reviewActions.ts` (`getReviewPeriod`, `saveReviewPeriod`, `reopenReviewPeriod`), `reviewPreferenceActions.ts`, `reviewQueueActions.ts`, `tradeReviewActions.ts`. SQL in `src/db/review*.ts`.
- **Data**: `review_periods`, `review_source_trades`, `review_source_cash_flows` (`src/db/review-schema.ts`).
- **Verification**: Unit `review-period.test.ts`, `review-autosave.test.ts`, `review-editor.test.tsx`, `review-hydration.test.tsx`. DB (optional) `review-database.test.ts`, `feature-integration.test.ts`.

### Data export (issue #15)

- **Entry**: "Export" button in the Journal header on the All entries and Trades tabs (`export-dialog.tsx`); "Your data" card in Settings (`src/components/settings/data-export.tsx`).
- **Flows**:
  - Trade CSV: the dialog shows the trade count, the active account and the period. The file has every trade that matches the current filters, not one page. It has a UTF-8 BOM, CRLF rows, a stable column order, exact decimal strings, UTC ISO times and the account currency. Text cells that start with `=`, `+`, `-`, `@`, tab or CR get a leading `'`. The file name is `jottrade-trades-<account>-<date>.csv`.
  - Full archive: one JSON file (`schemaVersion` 1) with all accounts, trades, funding entries, strategies, reviews and review source links. Screenshots are listed by URL, not bundled. Import batches, sessions and credentials are not included. The file name is `jottrade-archive-<date>.json`.
  - A failed export shows an error toast and downloads nothing. The server keeps no export job, so a retry cannot create a duplicate.
- **Server**: `src/server/exportActions.ts` (`exportTradesCsv`, `exportArchive`). The trade filter is shared with `getTrades` in `src/db/trade-filter.ts`. Archive queries: `src/db/journal-archive.ts`. Formatting: `src/lib/csv-export.ts`, `src/lib/archive.ts`.
- **Data**: reads `portfolios`, `trades`, `cash_flows`, `strategies`, `review_periods`, `review_source_trades`, `review_source_cash_flows`. No schema change.
- **Verification**: Unit `csv-export.test.ts` (escaping, injection guard, decimals, dates, file names), `export-actions.test.ts` (user and account scope of the query, foreign account refusal, archive counts). Gap: archive against a real database; no check that a screenshot URL still resolves.

### Dashboard

- **Entry**: `/dashboard` (the post-sign-in page); period picker.
- **Flows**: onboarding checklist (see "First-run onboarding"); account summary and funding notice; balance and trading P&L curves; risk metrics (Sharpe, drawdown, payoff ratio); performance and strategy charts; setup calculator (`src/components/tools/SetupCalculator.tsx`). Metric definitions: [metrics.md](metrics.md).
- **Server**: `getAnalytics.ts`, `getAdvancedAnalytics.ts`. Logic in `src/lib/analytics.ts`, `risk-metrics.ts`, `group-summary.ts`, `equity-series.ts`.
- **Data**: reads `trades`, `cash_flows`, `strategies`; writes nothing.
- **Verification**: Unit `analytics.test.ts`, `risk-metrics.test.ts`, `risk-metrics.test.tsx`, `group-summary.test.ts`. E2E `totals.spec.ts` (net P&L and trade count for one seeded account agree with the calendar and the strategy page). Gap: charts and risk metrics in the browser.

### Calendar

- **Entry**: `/calendar`; month navigation. A user with no trades sees an empty state with "Log your first trade".
- **Flows**: daily P&L per month; select a day → trade list (`DayTradesPopover.tsx`) → open a trade. A closed trade counts on its exit day, or its entry day when it has no exit.
- **Server**: `calendarActions.ts` (`getCalendarData`). Logic in `src/lib/calendar-days.ts`.
- **Data**: reads `trades`.
- **Verification**: Unit `calendar-days.test.ts`, `day-trades-popover.test.tsx`. E2E `totals.spec.ts` (day cells for February 2026 add up to the dashboard total, within the whole-unit rounding of the cells).

### Strategies

- **Entry**: `/strategies`; strategy selector in the trade form and the journal filter.
- **Flows**: create, edit and delete a strategy; view its all-time performance in the account currency (`StrategyPerformance.tsx`).
- **Server**: `strategyActions.ts` (`getStrategies`, `getStrategyPerformance`, `createStrategy`, `updateStrategy`, `deleteStrategy`).
- **Data**: `strategies` (owned by the user, not by an account); `trades.setup_id` links a trade.
- **Verification**: Unit `strategy-form.test.tsx`, `strategy-performance.test.tsx`, `group-summary.test.ts`. E2E `totals.spec.ts` (strategy total). DB (verify) `user-isolation.integration.test.ts` (another user cannot edit or delete a strategy). Gap: create, edit and delete in the browser.

### Settings and profile

- **Entry**: `/settings`, `/profile`.
- **Flows**: trading accounts, review preferences, the full archive download (see "Data export"), theme (light/dark/system, kept in local storage `vite-ui-theme`). Profile shows name and email; password change and 2FA are disabled.
- **Verification**: Gap.
