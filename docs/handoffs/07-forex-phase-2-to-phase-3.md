# Handoff: forex P&L phase 3

## Task

Implement Phase 3 of the Jottrade Forex P&L plan: journal quantity and conversion UX, forex-aware position sizing, account-currency settings UX, and final hardening.

Read `AGENTS.md` and the original implementation plan before changing code. Apply the repository-required coding skills, inspect nearby component and test patterns, write tests before implementation, reuse the Phase 1 and Phase 2 domain code, and keep all FX provider calls on the server. Do not push unless the user asks.

The original plan is available at:

```text
/Users/dhanabordeemekintharanggur/.codex/attachments/3459ae9b-e3e0-438a-840d-449f2b883ccc/pasted-text.txt
```

The intended Phase 3 commit message is:

```text
feat: add forex journal UX and position sizing
```

## Completed foundations

Phase 1 added:

- `src/lib/instruments.ts`, with the approved forex registry, standard lot contracts, JPY pip sizes, XAUUSD metadata, suffix normalization, and unit-based fallback behavior.
- `src/lib/fx.ts`, with pure identity, instrument-price inverse, and external-required conversion decisions.
- The explicit object-based `calculatePnL` API in `src/lib/finance.ts`.

Phase 2 added:

- Nullable trade calculation snapshots for quantity unit, contract size, base and quote currencies, P&L currency, and entry and exit conversion rate, source, and as-of time.
- `fx_rate_cache`, with a unique provider/from/to/rate-key index. Twelve Data historical entries use UTC-minute keys, Frankfurter historical entries use UTC-date keys, and current entries use configurable minute buckets.
- Twelve Data `exchange_rate` as the default primary provider and Frankfurter v2 as fallback. Requests use UTC, a five-second timeout, strict response checks, and no retries.
- Server-side provider configuration through `FX_RATE_PROVIDER`, `FX_RATE_FALLBACK_PROVIDER`, `TWELVE_DATA_API_KEY`, and `FX_RATE_CURRENT_CACHE_MINUTES`.
- Portfolio ownership checks and authoritative use of `portfolio.currency` during trade creation, updates, and imports.
- Local conversion before provider access. Quote equals account currency uses `IDENTITY`; base equals account currency uses `INSTRUMENT_PRICE`; only third-currency conversion reaches the rate service.
- Edit invalidation that reuses stored rates for quantity, fees, and side; performs no calculation for note and psychology-only edits; refreshes only changed date legs; recalculates instrument-price legs locally after price changes; and re-resolves both legs after symbol or portfolio changes.
- Broker import protection. Broker-reported P&L is unchanged, provider calls are impossible in the import calculation path, conversion rates remain null, and snapshot sources use `BROKER_REPORTED`.
- Local-only calculation for imports without broker P&L. Rows that require an external conversion keep P&L empty and return this warning:

```text
P&L could not be calculated automatically because external currency conversion is required.
```

- Server rejection of portfolio currency changes once the account has a trade or cash flow:

```text
Account currency cannot be changed after account activity exists.
Create another account if you need a different account currency.
```

## Phase 2 files and entry points

- Migration: `drizzle/0006_talented_ender_wiggin.sql`
- Schema: `src/db/schema.ts`
- Provider and cache service: `src/server/fx/`
- Production current or historical rate resolver: `resolveFxRate` from `src/server/fx/index.ts`
- Trade snapshot and update invalidation logic: `src/server/trade-calculation.ts`
- Import snapshot logic: `src/server/import-calculation.ts`
- Currency lock rule: `src/server/portfolio-currency.ts`
- Server integration: `src/server/tradeActions.ts`, `src/server/importActions.ts`, and `src/server/portfolioActions.ts`
- Tests: `src/test/fx-rate-service.test.ts`, `src/test/trade-calculation.test.ts`, `src/test/import-calculation.test.ts`, and `src/test/portfolio-currency.test.ts`

Do not duplicate provider or conversion logic in components. For current third-currency position sizing, call the existing server-side `resolveFxRate` with `mode: "CURRENT"`. Add the smallest authenticated server function needed by the calculator and keep the API key out of the client graph.

## Phase 3 scope

### Trade entry

Update `src/components/journal/TradeEntryForm.tsx` to resolve instrument metadata locally while the user enters a symbol.

- Forex quantity label: `Quantity (lots)` with optional helper `1 standard lot = 100,000 units`.
- XAUUSD quantity label: `Quantity (lots)` with helper `1 lot = 100 oz`.
- Unknown or stock quantity label: `Quantity`.
- Preserve entered precision such as `3.525`. Do not round the stored value.
- Do not call an FX provider from this component.

### Trade details

Update `src/components/journal/TradeDetailSheet.tsx` to show useful snapshot data without turning the sheet into a debug view.

- Show quantity with `lots` or `units` and show position units as quantity multiplied by contract size.
- For converted trades, show quote/P&L currency, account currency, exit conversion pair and rate, and a readable source.
- Label Frankfurter as a daily reference rate.
- Label `BROKER_REPORTED` as broker-reported P&L.
- Old rows have nullable snapshot fields. Render them safely and do not infer missing historical metadata.

### Account currency settings

Match the server restriction in the settings UI. Disable or otherwise prevent currency changes when `tradeCount > 0`. The existing account record does not expose cash-flow count, so either extend the owned account query with the minimum activity flag/count or rely on the server error for cash-flow-only accounts while presenting it clearly. Do not weaken the server rule.

Use this explanation:

```text
Account currency cannot be changed after trading activity exists.
```

### Position sizing

Refactor `src/components/tools/SetupCalculator.tsx` and extract pure calculation code if needed for focused tests.

- Add a symbol input and use `resolveInstrumentSpec`.
- Risk amount in account currency is `balance * riskPercent / 100`.
- Stop distance is `abs(entryPrice - stopPrice)`.
- Risk per lot in quote currency is `stopDistance * contractSize`.
- Risk per lot in account currency is the quote amount multiplied by the quote-to-account rate at the stop.
- Lots are `riskAmountAccount / riskPerLotAccount`; units are lots multiplied by contract size.
- Use actual price distance for sizing. Pip distance is display-only and uses the instrument `pipSize`.
- EURUSD in a USD account uses rate `1`; USDJPY in a USD account uses `1 / stopPrice`; EURJPY in a USD account uses a current cached JPY/USD estimate.
- Fetch only after the user clicks Calculate. Never fetch on keypress, slider change, render, polling, or background work.
- Repeated third-currency calculations in the same configured cache bucket should hit Postgres rather than Twelve Data.
- Equities remain unit-based and must not be labeled as lots.

### Failure behavior

If Twelve Data fails and Frankfurter succeeds, show the calculated estimate and identify the daily source. If both fail, show a plain conversion-specific error without exposing provider details or secrets. Never substitute rate `1`.

## Required final matrix

Cover at least:

| Instrument | Account | Conversion |
| --- | --- | --- |
| EURUSD, GBPUSD, AUDUSD, NZDUSD | USD | identity |
| USDJPY, USDCHF, USDCAD, USDTHB | USD | instrument-price inverse |
| EURJPY, GBPJPY, AUDJPY | USD | external JPY/USD |
| EURGBP | USD | external GBP/USD |
| XAUUSD | USD | identity |
| AAPL | USD | unit-based fallback |
| EURUSD | EUR | instrument-price inverse |
| GBPJPY | EUR | external JPY/EUR |

Verify dashboard, journal, calendar, and analytics reads continue using stored account-currency `netPnl` and make no FX calls.

## Verification state and known baseline

At the end of Phase 2:

- The full Vitest suite passes.
- The production build passes.
- Focused Biome checks pass for every Phase 2 file.
- Searching the public build output finds no Twelve Data URL, API-key variable, or FX resolver implementation.
- `npm run db:generate` produced the additive migration. A live `db:migrate` was not run because this worktree had no `DATABASE_URL`.
- Repository-wide `npm run check` still fails on the pre-existing Biome baseline. At the Phase 2 verification point it reported 13 errors and 50 warnings, including unrelated diagnostics in `src/components/Header.tsx`, `src/components/ui/calendar.tsx`, `src/components/journal/FilterBar.tsx`, strategy components, and `.vscode/settings.json`. Do not fold a broad cleanup into Phase 3. Fix diagnostics on lines Phase 3 changes and report the remaining baseline accurately.
- Repository-wide `tsc --noEmit` also has pre-existing errors in demo, header, strategy, and GCP files. Phase 2-owned files had no TypeScript diagnostics.

Run before completing Phase 3:

```bash
npm run test
npm run check
npm run build
```

Also inspect the generated migration, search the client output for provider code and secret names, and verify zero FX requests for local conversions, broker imports, analytics, and journal reads.

## Boundaries

Do not add WebSockets, live streaming, broker integration, order execution, margin or leverage modeling, Redis, scheduled refreshes, background FX synchronization, a tick database, generic provider abstractions, automatic historical portfolio conversion, or bulk historical recalculation.
