# jottrade — Capability Baseline (as-built)

**Date:** 2026-08-06
**Scope:** Read-only analysis of the existing codebase at `HEAD` (branch `chore/agent-skills-setup`).
**Method:** Every claim below is traced to code that was read. Citations are `path:line`.

---

## 1. Current data model

Schema file: `src/db/schema.ts` (190 lines, single file). Migrations: `drizzle/0000_dark_professor_monster.sql`, `drizzle/0001_daffy_thunderbolts.sql`.

### 1.1 BetterAuth-managed tables

Declared under the `// --- Auth Schema (BetterAuth) ---` banner at `src/db/schema.ts:4`. BetterAuth is wired to these via the Drizzle adapter at `src/lib/auth.ts:8-10`.

| Table | Column | Type | Null | Notes |
|---|---|---|---|---|
| `user` (`:6`) | `id` | text PK | no | |
| | `name` | text | no | |
| | `email` | text | no | unique (`:9`) |
| | `emailVerified` | boolean | no | default `false` |
| | `image` | text | yes | |
| | `createdAt` / `updatedAt` | timestamp | no | `defaultNow()`, `$onUpdate` |
| `session` (`:19`) | `id` | text PK | no | |
| | `expiresAt` | timestamp | no | |
| | `token` | text | no | unique |
| | `createdAt` / `updatedAt` | timestamp | no | |
| | `ipAddress`, `userAgent` | text | yes | |
| | `userId` | text FK → `user.id` | no | `onDelete: cascade`; index `session_userId_idx` (`:35`) |
| `account` (`:38`) | `id` | text PK | no | |
| | `accountId`, `providerId` | text | no | |
| | `userId` | text FK → `user.id` | no | cascade; index (`:59`) |
| | `accessToken`, `refreshToken`, `idToken`, `scope`, `password` | text | yes | |
| | `accessTokenExpiresAt`, `refreshTokenExpiresAt` | timestamp | yes | |
| | `createdAt` / `updatedAt` | timestamp | no | |
| `verification` (`:62`) | `id` | text PK | no | |
| | `identifier`, `value` | text | no | index on `identifier` (`:75`) |
| | `expiresAt` | timestamp | no | |
| | `createdAt` / `updatedAt` | timestamp | no | |

### 1.2 Application tables

| Table | Column | Type | Null | Notes |
|---|---|---|---|---|
| `portfolios` (`:81`) | `id` | serial PK | no | |
| | `userId` | text FK → `user.id` | no | cascade (`:83`) |
| | `name` | text | no | |
| | `currency` | text | yes | default `'USD'` |
| | `initialBalance` | numeric | yes | default `'0'` |
| | `isDefault` | boolean | yes | default `false` — **never read or written anywhere in `src/`** |
| | `createdAt` | timestamp | yes | `defaultNow()` |
| `trades` (`:92`) | `id` | serial PK | no | |
| | `portfolioId` | integer FK → `portfolios.id` | **yes** | cascade (`:94`) |
| | `userId` | text FK → `user.id` | no | cascade |
| | `symbol` | text | no | |
| | `side` | text | no | free text; only `'LONG'`/`'SHORT'` written (`src/server/tradeActions.ts:14`) |
| | `status` | text | yes | default `'OPEN'`; free text, `OPEN`/`CLOSED`/`PENDING` by convention |
| | `entryDate` | timestamp | no | |
| | `exitDate` | timestamp | yes | |
| | `entryPrice`, `exitPrice`, `quantity` | numeric | **yes** | all nullable despite being required by the entry form |
| | `fees` | numeric | yes | default `'0'` — a single scalar |
| | `netPnl`, `returnPercent` | numeric | yes | **denormalized**, computed at write time |
| | `setupId` | integer | yes | **no DB-level FK** — relation declared only in Drizzle (`:177-180`) |
| | `mistake` | text | yes | free text; UI offers a fixed list |
| | `confidence` | text | yes | free text; `HIGH`/`MEDIUM`/`LOW` by convention |
| | `notes` | text | yes | plain text |
| | `screenshots` | jsonb | yes | default `[]`, array of public GCS URLs |
| | `importHash` | text | yes | **unique**, but never assigned anywhere (see §4) |
| | indexes | | | `idx_trades_user` on `userId`, `idx_trades_date` on `entryDate` (`:124-125`) |
| `strategies` (`:129`) | `id` | serial PK | no | |
| | `userId` | text FK → `user.id` | no | cascade |
| | `name` | text | no | |
| | `description` | text | yes | |

### 1.3 Relations (`src/db/schema.ts:136-189`)

`user` → many `sessions`/`accounts`/`portfolios`/`trades`/`strategies`; `portfolios` → many `trades`; `trades` → one `portfolio`, one `user`, one `strategy` (via `setupId`); `strategies` → many `trades`.

Note: `trades.setupId` has a Drizzle relation but **no SQL foreign key** — confirmed by `drizzle/0001_daffy_thunderbolts.sql:43-46`, which adds FKs for `portfolios.user_id`, `strategies.user_id`, `trades.portfolio_id`, `trades.user_id`, and nothing for `setup_id`. Referential integrity for strategies is enforced in application code instead: `deleteStrategy` nulls the references inside a transaction (`src/server/strategyActions.ts:61-69`).

### 1.4 What the schema can and cannot express

**Can express:**
- A single-leg, single-fill position: one symbol, one side, one entry price/date, one exit price/date, one quantity.
- Long and short direction — `side` is stored and the P&L sign is flipped for shorts (`src/lib/finance.ts:25-29`).
- One aggregate fee number per trade (`fees`).
- Open vs closed lifecycle via `status` + nullable `exitDate`/`exitPrice`.
- One strategy tag, one mistake tag, one confidence tag per trade.
- A list of screenshot URLs, and free-text notes.
- Multiple portfolios per user, each with a currency and an initial balance.

**Cannot express (no column exists):**
- **Partial exits / scaling.** There is exactly one `exitPrice`, one `exitDate`, one `quantity`. Nothing models an execution or fill. Any partial exit must be flattened by the user into an averaged single row.
- **Scaling in.** Same reason — no way to store multiple entries.
- **Fee breakdown.** `fees` is one numeric. The MT4/5 importer collapses commission and swap into it by absolute-value summation (`src/components/journal/ImportZone.tsx:39-40`), destroying the distinction and the sign.
- **Options.** No strike, expiry, contract type, multiplier, or underlying. `quantity × price` math in `calculatePnL` (`src/lib/finance.ts:26-28`) has no contract multiplier, so option P&L would be wrong by 100×.
- **Futures / leverage / margin.** No leverage, margin, notional, or contract-size column. `returnPercent` is computed against `entry × qty` as if it were fully funded cash (`src/lib/finance.ts:36-37`). The importer explicitly acknowledges this and falls back to price return (`src/server/importActions.ts:62-64`).
- **Stop loss / take profit / planned risk.** The MT4/5 CSV header comment lists `stop_loss` and `take_profit` (`src/components/journal/ImportZone.tsx:25`) but `mapCsvToTrade` (`:42-53`) does not map them, because there is nowhere to put them. Consequently **real R-multiple is not computable** — `computeAvgRR` is a win/loss ratio proxy, not R (`src/lib/analytics.ts:60-67`).
- **Multi-currency.** `portfolios.currency` exists but is never read. Every UI money format hardcodes `currency: "USD"` (e.g. `src/components/journal/JournalTable.tsx:73`, `src/routes/_authenticated/dashboard.tsx:96`).
- **Multiple tags per trade.** `mistake` and `confidence` are single text columns, not join tables. The CLAUDE.md claim that trades have "tags" has no column behind it.
- **Timezone.** All timestamps are `timestamp` without time zone.
- **Deposits / withdrawals / cash flow.** Balance is derived purely as `initialBalance + Σ netPnl` (`src/server/getAnalytics.ts:43,61`).
- **Trade-level audit trail.** `trades` has no `createdAt`/`updatedAt`.

---

## 2. Current feature surface

### 2.1 Route map (`src/routes/`)

| Route | File | State |
|---|---|---|
| `/` | `index.tsx` | **Stub.** Still the unmodified TanStack Start starter landing page — "The framework for next generation AI applications", TanStack logo, six framework-feature cards (`src/routes/index.tsx:13-51`). Only real content is the Sign In / Sign Up links (`:82,88`). |
| `/_authenticated` | `_authenticated/route.tsx` | Client-side auth guard: renders spinner while `authClient.useSession()` is pending, `<Navigate to="/sign-in">` if no session (`:12-22`). |
| `/dashboard` | `_authenticated/dashboard.tsx` | Real. Stat cards, equity curve, win-rate pie, profit factor, advanced analytics, and the position-size calculator. |
| `/journal` | `_authenticated/journal.tsx` | Real. Table + filters + paging + create drawer + import dialog + detail sheet. |
| `/calendar` | `_authenticated/calendar.tsx` | Real. Month grid with prev/next/today, driven by URL search params (`:13-16`). |
| `/strategies` | `_authenticated/strategies.tsx` | Real. Master/detail CRUD. |
| `/settings` | `_authenticated/settings.tsx` | **Near-stub.** 39 lines; the only setting is the light/dark `ModeToggle` (`:31`). No portfolio, account, currency, or export settings. |
| `/profile` | `profile.tsx` | **Mostly stub, and unguarded.** Sits outside `_authenticated/` and does its own session check (`:13-38`). Displays name/email read-only. "Change Password" (`:136`), "Enable 2FA" (`:152`), and the avatar camera button (`:79`) are non-functional buttons with no handlers. Also displays hardcoded text "Last changed 3 months ago" (`:133`). |
| `/sign-in`, `/sign-up` | `_unauthenticated/` | Real (218 / 255 lines). |
| `/api/auth/$` | `api/auth/$.ts` | BetterAuth mount. |
| `/demo/*` | `src/routes/demo/` | **10 leftover starter demo routes** (`start.ssr.*`, `tanstack-query`, `neon`, `api.names`, `api.tq-todos`, …), all still shipping. |

Navigation exposes only five items — Dashboard, Journal, Calendar, Strategies, Settings (`src/lib/nav-items.ts:16-22`) — rendered as a sidebar on desktop and a bottom bar on mobile (`src/routes/__root.tsx:78-85`, hidden on sign-in/sign-up at `:38-39`).

### 2.2 What a user can actually do today

**Trades**
- Log a trade manually: symbol, side, entry date, entry price, quantity, optional exit price, exit date, fees, notes (`src/components/journal/TradeEntryForm.tsx:26-40`). Note the create form does **not** expose portfolio, strategy, confidence, or mistake.
- Browse trades in a sortable table with columns Date, Symbol, Side, Entry, Exit, Qty, Exit Date, Status, Fees, Net P&L, ROI (`src/components/journal/JournalTable.tsx:34-156`). Sorting is client-side over the current page only (`:168-177`).
- Page through results at 50 rows/page (`src/server/getTrades.ts:9`, pager at `journal.tsx:194-224`).
- Filter by symbol (LIKE), side, status, strategy (incl. "none"), confidence (multi), mistake (multi), and entry-date range — filter state lives in the URL (`src/routes/_authenticated/journal.tsx:37-47`, applied server-side at `src/server/getTrades.ts:36-45`).
- Open a trade detail sheet and edit prices/dates/quantity/fees, set confidence, mistake (from a fixed list at `TradeDetailSheet.tsx:35`), and strategy; edit notes; upload and delete screenshots (`TradeDetailSheet.tsx:101-165`).
- Delete a trade (`src/server/tradeActions.ts:164-180`) — server function exists.

**Import**
- Drag-drop a CSV in the MT4/5 layout and confirm a preview of up to 50 rows before committing (`src/components/journal/ImportZone.tsx:56-93,115-180`).

**Strategies**
- Full CRUD from `/strategies`: list, create, rename/redescribe, delete (`src/server/strategyActions.ts:9-71`).

**Analytics / Calendar**
- View dashboard metrics and charts (§3).
- View a month calendar coloured by daily net P&L, with a per-day popover of trades (`src/server/calendarActions.ts:23-89`, `src/components/calendar/`).

**Tools**
- Position-size calculator: balance, risk %, entry, stop, target → risk amount, position size, R:R (`src/components/tools/SetupCalculator.tsx:36-59`). **It has no route of its own** — CLAUDE.md describes a `tools` route, but the component is only embedded inside the dashboard sidebar column (`dashboard.tsx:188-191`). Its results are display-only; nothing is persisted or fed back into a trade.

**Account**
- Sign up / sign in with email+password or Google (`src/lib/auth.ts:11-19`), view profile, toggle theme.

**Notably absent from the UI even though the data model allows it:** portfolios. There is no portfolio create/select/switch screen anywhere. Both analytics functions just take `.limit(1)` on the user's portfolios and fall back to a hardcoded `10000` (`src/server/getAnalytics.ts:30-31`, `src/server/getAdvancedAnalytics.ts:35-38`). No code path ever inserts a `portfolios` row, so in practice every user gets the 10 000 default.

---

## 3. Analytics implemented today

### 3.1 `src/server/getAnalytics.ts` (dashboard headline)

Loads **all** of the user's trades ordered by `entryDate` asc (`:23-26`) plus the first portfolio (`:30`), then iterates once (`:52-78`):

| Metric | How | Line |
|---|---|---|
| `activeTrades` | count of rows with `status === 'OPEN'`, which are then skipped | `:53-56` |
| `totalTrades` | count of non-OPEN rows | `:59` |
| `totalPnL` | `Σ netPnl` over non-OPEN rows | `:60` |
| `totalBalance` | `initialBalance + Σ netPnl` | `:43,61` |
| `winRate` | `winCount / totalTrades × 100`, where a win is `pnl > 0` | `:63,81` |
| `profitFactor` | `grossProfit / grossLoss`; `999` if there are profits but no losses, else `0` | `:84` |
| `equityCurve` | one `{date, balance}` point per closed trade, dated by `exitDate` | `:72-77` |

Caveats visible in the code: a trade with `pnl === 0` is counted as a **loss** (`:66`); `status === 'PENDING'` rows are treated as closed and folded into P&L; the equity curve is ordered by `entryDate` but labelled with `exitDate`, so it can be non-monotonic in time.

### 3.2 `src/server/getAdvancedAnalytics.ts`

Loads only `status = 'CLOSED'` trades ordered by `exitDate` asc (`:31-33`), plus strategies and the first portfolio, then computes:

**Risk metrics** (pure functions in `src/lib/analytics.ts`, the only unit-tested module):
- `sharpe` — daily P&L grouped by UTC exit date (`analytics.ts:11-18`), mean/sample-stddev with `n-1`, annualized by `√252`, risk-free rate 0, returns `0` for `<2` days or zero stddev (`analytics.ts:25-34`). Note it is a Sharpe of **dollar** P&L, not of returns.
- `maxDrawdown` — peak-to-trough over the running balance seeded at `initialBalance`; returns `{dollars, percent}` (`analytics.ts:41-57`). Requires pre-sorted input, which the caller does provide.
- `avgRR` — `avg win / |avg loss|`; `0` if either side is empty (`analytics.ts:60-67`). This is **not** an R-multiple against planned risk (no stop is stored).
- `avgHoldTimeHours` — mean `exitDate − entryDate` in hours (`analytics.ts:70-77`).

**Breakdowns** (each aggregated to `{count, totalPnl, avgPnl, winRate}` by `aggregateGroup` at `:12-21`):
- by strategy name, with `'Unassigned'` for null `setupId` and `'Unknown'` for a dangling id (`:57-66`);
- by symbol, top 10 by trade count (`:69-77`);
- by day of week, **Monday–Friday only** — weekend trades are silently dropped (`:80-87`), which excludes crypto;
- by entry hour, keyed `"H:00"` using **server-local** `getHours()` (`:90-99`).

Rendered by `RiskMetrics.tsx` (4 metric cards) and `PerformanceCharts.tsx` (Recharts bar charts, green/red by sign).

### 3.3 `src/server/calendarActions.ts`

Two queries per month: closed trades bucketed by `exitDate`, open trades (`exitDate IS NULL`) bucketed by `entryDate` (`:34-58`). Returns `Record<'YYYY-MM-DD', {netPnl, tradeCount, trades[]}>`. Day keys use `toISOString()` (UTC) while the month boundaries are built with `new Date(year, month-1, 1)` (**server-local**) at `:30-31` — the two are inconsistent.

---

## 4. Import capability

Everything lives in two files: the client mapper `src/components/journal/ImportZone.tsx` and the server writer `src/server/importActions.ts`.

**Formats:** CSV only. Enforced by extension/MIME check (`ImportZone.tsx:61-64`), parsed with PapaParse using `header: true` (`:66-68`).

**Brokers:** exactly one layout — MT4/MT5, hardcoded to these column names (`:25-52`): `ticket, opening_time_utc, closing_time_utc, type, lots, symbol, opening_price, closing_price, commission_usd, swap_usd, profit_usd, close_reason`. There is no column-mapping UI, no format auto-detection, and no second broker adapter. The dialog copy claims "standard MT4/MT5 export formats" (`journal.tsx:139-141`).

**Mapping decisions:**
- `netPnl = profit_usd + commission_usd + swap_usd` (`:36`).
- `fees = |commission_usd| + |swap_usd|` (`:40`) — sign and breakdown are lost.
- `quantity ← lots` — lots are stored directly as quantity with no contract-size conversion.
- `notes ← "Ticket: {ticket} | Reason: {close_reason}"` (`:52`) — the broker ticket id is stuffed into free text.
- `stop_loss`, `take_profit`, `equity_usd`, `margin_level`, `original_position_size` are read in the header comment but **not mapped**.

**Validation:**
- Client: a row is dropped silently if it has no `ticket` or no `symbol` (`:27-28`). Zero valid rows → generic error "No valid trades found in CSV" (`:83`).
- Server: `importTradeSchema` is **declared** at `importActions.ts:10-24` but **never invoked**. The payload is cast (`as z.infer<...>[]`, `:32`) and iterated directly (`:44`). There is no `.parse()` anywhere in the import path — this is the only server function in `src/server/` that skips validation of its input.
- Side derivation: `item.side.toLowerCase().includes("buy") ? "LONG" : "SHORT"` (`:46`) — anything not containing "buy" becomes SHORT.
- Auth is checked (`:34-40`), but **`portfolioId` is never set** on imported rows (`:92-108`), so imports are orphaned from any portfolio.
- **No deduplication.** `trades.importHash` is declared `unique` at `schema.ts:122`, but `grep` across `src/` finds no other reference. Re-uploading the same CSV inserts duplicates.
- No batching or row cap: a single `db.insert(trades).values(valuesToInsert)` for the whole file (`:112`).
- No per-row error reporting; the result is `{success, count}` and the UI reports it with `alert()` (`ImportZone.tsx:107`).

---

## 5. Architectural observations relevant to a large overhaul

**Clean seams (leverage these):**
- `src/lib/analytics.ts` is pure, dependency-free, documented, and fully unit-tested. It is the one module that can be refactored with confidence.
- `src/server/*.ts` is a genuine boundary: every handler independently re-establishes the session via `auth.api.getSession({ headers: getRequestHeaders() })` and scopes queries by `session.user.id`. Ownership is checked on update/delete paths (`tradeActions.ts:115-122`, `imageActions.ts:36-38`, `strategyActions.ts:49`). Multi-tenant isolation is consistent.
- `src/lib/gcp.ts` is fully self-contained and Workers-compatible by design (Web Crypto, no `@google-cloud/storage`).
- URL-as-state for journal filters and calendar month (`journal.tsx:37-47`, `calendar.tsx:13-16`) means filter/paging logic is not trapped in component state.
- Newer server functions (`strategyActions`, `calendarActions`, `imageActions`, `getTrades`) consistently `zod.parse(ctx.data)`.

**Tangled / risky areas:**
- **Two database clients.** `src/db/index.ts` uses `node-postgres` `Pool` over `DATABASE_URL || VITE_DATABASE_URL`; `src/db.ts` (a separate, older file) exports a *second* `db` built on `neon-http` from `VITE_DATABASE_URL`. Only `@/db` (the directory) is imported by application code, but the duplicate exists and the `pg` Pool is not a Workers-friendly driver despite the stated Cloudflare Workers deploy target.
- **Denormalized P&L with three write paths.** `netPnl`/`returnPercent` are recomputed in `createTrade` (`tradeActions.ts:64-75`), recomputed-on-merge in `updateTrade` (`:134-140`), and computed *differently* in `importActions.ts:59-89` (which prefers the CSV's own P&L and uses price-return rather than cost-basis return). Three sources of truth for the same two columns. Any schema change to fees/quantity/multiplier has to be reflected in all three.
- **`updateTrade` merge semantics are fragile.** Field merging uses `||` (`tradeActions.ts:124-128`), so a legitimate `"0"` or `""` falls through to the existing value. The `setValues` builder immediately below (`:143-157`) carries a comment explaining that Drizzle does not skip `undefined` — this is exactly the class of bug that a wider schema will multiply.
- **`ctx: any` everywhere.** Every server function handler is typed `(ctx: any)` (all 8 files), and call sites cast back (`getTrades({ data: queryParams } as any)` at `journal.tsx:102`, `(advanced as any).riskMetrics...` at `dashboard.tsx:205-216`). The end-to-end type safety the stack is chosen for is not actually in effect at the server-function boundary — a schema change will not surface as a type error.
- **Numeric columns are strings.** Drizzle `numeric` round-trips as `string`; the code does `Number(...)`/`parseFloat(...)` at every read site (analytics, calendar, table cells). `src/lib/finance.ts:1-8` opens with a comment weighing decimal precision and then settles on JS floats with `toFixed(2)`. Money precision is not currently guaranteed.
- **Fan-out on schema change.** `trades` columns are referenced from: `getTrades.ts` (filter schema), `getAnalytics.ts`, `getAdvancedAnalytics.ts`, `calendarActions.ts`, `tradeActions.ts`, `importActions.ts`, `imageActions.ts`, plus the client-side `Trade` type re-declared in `JournalTable.tsx:20-32` and the form schemas in `TradeEntryForm.tsx:26-40` and `TradeDetailSheet.tsx:45`. There is **no shared domain type** — the trade shape is redefined at least four times.
- **No repository/service layer.** Server functions call Drizzle directly. There is no place to put an invariant like "netPnl must equal the sum of the exit legs".
- **Migration history is thin.** Two migrations only, and `0001` includes `DROP TABLE "todos" CASCADE` (`:42`) — the starter's table. There is no seed data, no migration test, and no rollback story.
- **Starter residue.** `/` is still the TanStack marketing page, `src/routes/demo/` holds 10 demo routes, `src/data/demo.punk-songs.ts` is still present. The `_authenticated` guard is client-side only (`route.tsx:20-21`) — pages render after hydration, and `/profile` is outside the guard entirely.
- **Docs drift.** `CLAUDE.md` states the DB is "Neon serverless PostgreSQL" (actual runtime client is `pg.Pool`), lists a `tools` route (does not exist), and describes trades as having "tags" (no such column).

**Test coverage reality:** two test files, 114 lines total.
- `src/test/analytics.test.ts` (87 lines) — good coverage of the five pure analytics functions including edge cases.
- `src/test/nav-items.test.ts` (27 lines) — asserts the nav array.
- **Zero tests** for: any server function, auth, `calculatePnL` in `src/lib/finance.ts`, the CSV mapper, any React component, and any database interaction. No integration tests, no E2E, no Playwright. Against the repo's own stated 80% bar, effective coverage of the trade domain is near zero. **A schema overhaul currently has no regression net over P&L math, import, or persistence.**

---

## 6. Explicit "not present" list

Trading-journal capabilities with **no code behind them at all** (verified by grep across `src/`):

| Capability | Status |
|---|---|
| Partial exits / scaling in or out | No column, no code |
| Executions / fills as first-class records | No table |
| Stop loss, take profit, planned risk, R-multiple | Not stored; `avgRR` is a win/loss proxy |
| Options (strike, expiry, type, multiplier) | No columns |
| Futures / contract size / leverage / margin | No columns |
| Multi-currency (beyond a never-read `portfolios.currency`) | UI hardcodes USD |
| FX conversion | None |
| Portfolio management UI (create/select/switch) | No route, no server function; no code ever inserts a `portfolios` row |
| Account deposits / withdrawals / cash flow | None |
| Import deduplication | `importHash` column exists but is never written |
| Broker adapters beyond MT4/5 | One hardcoded mapper |
| Broker API / live sync | None |
| Manual CSV column mapping UI | None |
| Data export (CSV/JSON/PDF) | None |
| Market data / price quotes / charts of the instrument | No provider, no code |
| Open-position mark-to-market / unrealized P&L | Open trades are counted then skipped |
| Daily journal / pre-market plan / end-of-day review entity | No table |
| Rich text or markdown notes | Plain `Textarea`, deliberately (design doc §Notes Tab) |
| Free-form trade tags (many-to-many) | `mistake`/`confidence` are single text columns |
| Trade-level created/updated audit timestamps | No columns |
| Soft delete / undo | Hard `DELETE` |
| Sharing, public trade links, social | None |
| Notifications / email / alerts | None |
| Goals, targets, rule checklists, discipline scoring | None |
| Monte Carlo, expectancy, Kelly, streak analysis | Not computed |
| Benchmark comparison (SPY etc.) | None |
| Time-zone handling | All timestamps naive; mixed UTC/local bucketing |
| Server-side sorting on the journal table | Fixed `desc(entryDate)`; sorting is per-page client-side |
| Bulk edit / bulk delete of trades | None |
| Rate limiting on server functions | None |
| Toast notifications / structured error UI | `alert()` in the import path |
| Onboarding / empty-state guidance | None beyond "No trades found." |
| Admin, billing, or subscription surface | None |
| E2E or component tests | None |

---

## Files read for this baseline

`src/db/schema.ts`, `src/db/index.ts`, `src/db.ts`, all 8 files in `src/server/`, `src/lib/{analytics,finance,auth,gcp,nav-items}.ts`, all files under `src/routes/_authenticated/`, `src/routes/index.tsx`, `src/routes/profile.tsx`, `src/routes/__root.tsx`, `src/components/journal/{JournalTable,FilterBar,ImportZone,TradeEntryForm,TradeDetailSheet}.tsx`, `src/components/dashboard/*`, `src/components/tools/SetupCalculator.tsx`, `src/components/calendar/*` (structure), `src/components/strategies/*` (structure), `src/test/*`, `drizzle/0000_*.sql`, `drizzle/0001_*.sql`, `package.json`, `CLAUDE.md`, `docs/superpowers/specs/2026-03-26-trading-journal-design.md`, `docs/superpowers/specs/2026-03-27-responsive-navigation-design.md`.
