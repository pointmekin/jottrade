# Handoff: forex P&L phase 2

## Task

Implement Phase 2 of the Jottrade Forex P&L plan: FX providers, persistent rate caching, trade calculation snapshots, and server-side trade integration.

Work on Phase 2 only. Read `AGENTS.md` and the original implementation plan before changing code. Apply the required coding skills, inspect the current schema and server patterns, write tests before implementation, keep provider logic server-only, run the requested verification, and commit with this message:

```text
feat: add historical fx conversion and trade snapshots
```

Do not push. When Phase 2 is complete, write a self-contained Phase 3 handoff under `docs/handoffs/` and create a new Codex task from the Phase 2 commit for the journal UX, position sizing, and final hardening work.

The original plan is available at:

```text
/Users/dhanabordeemekintharanggur/.codex/attachments/3459ae9b-e3e0-438a-840d-449f2b883ccc/pasted-text.txt
```

## Completed Phase 1

Phase 1 added:

- `src/lib/instruments.ts`, with a data-driven registry for all 48 requested forex pairs, standard 100,000-unit lot contracts, JPY pip sizing, XAUUSD's 100-ounce lot contract, broker suffix matching, and unit-based fallback behavior.
- `src/lib/fx.ts`, with pure identity, inverse instrument-price, and external-required conversion decisions.
- An object-based `calculatePnL` API in `src/lib/finance.ts`. Callers now pass contract size, entry and exit conversion rates, and account-currency fees explicitly.
- Unit coverage for every registered pair, separators and suffixes, XAUUSD, unknown instruments, all three conversion paths, explicit stock and metal behavior, and the required 3.525-lot USDJPY example.

The production call sites in `tradeActions.ts` and `importActions.ts` were updated for the new explicit calculation API. They currently pass conversion rates of `1` as a temporary bridge because Phase 1 does not read portfolio currency or fetch FX rates. Phase 2 must replace that bridge with authoritative portfolio-currency resolution. Do not leave cross-currency trades on identity conversion.

Phase 1 verification:

- `npm run test`: 89 tests pass.
- `npm run build`: passes.
- Focused Biome checks pass for `src/lib/instruments.ts`, `src/lib/fx.ts`, `src/lib/finance.ts`, and their tests.
- Repository-wide `npm run check` still fails on pre-existing Biome errors and warnings. Examples include `src/components/Header.tsx`, `src/components/ui/calendar.tsx`, `.vscode/settings.json`, and pre-existing implicit or explicit `any` diagnostics in server and UI files. Do not mix a repository-wide cleanup into Phase 2. Fix diagnostics in lines Phase 2 changes and report the remaining baseline accurately.

## Phase 2 scope

### Schema and migration

Add nullable calculation snapshot fields to `trades`:

```text
quantityUnit
contractSize
baseCurrency
quoteCurrency
pnlCurrency
entryConversionRate
entryConversionSource
entryConversionAsOf
exitConversionRate
exitConversionSource
exitConversionAsOf
```

Sources are `IDENTITY`, `INSTRUMENT_PRICE`, `TWELVE_DATA`, `FRANKFURTER`, and `BROKER_REPORTED`. Keep old rows unchanged.

Add an `fxRateCache` table keyed uniquely by provider, source currency, target currency, and rate key. Store the rate, as-of time, precision, and creation time. Historical Twelve Data keys use UTC-minute buckets. Frankfurter historical keys use UTC dates. Current-rate keys use configurable five-minute buckets.

Generate a normal Drizzle migration. Do not edit old migrations or bulk-recalculate trades.

### Configuration and providers

Update `.env.example` with server-only settings:

```dotenv
DATABASE_URL=
DATABASE_URL_POOLER=
FX_RATE_PROVIDER=twelve_data
FX_RATE_FALLBACK_PROVIDER=frankfurter
TWELVE_DATA_API_KEY=
FX_RATE_CURRENT_CACHE_MINUTES=5
```

Do not add a `VITE_` API key. Implement Twelve Data `exchange_rate` as primary and Frankfurter v2 as fallback. Use UTC, a roughly five-second timeout, strict response validation, no retries, and no logging of keyed URLs. Frankfurter results have daily precision.

Build one central `resolveFxRate` function with `HISTORICAL` and `CURRENT` modes. Check the configured provider cache before each provider call. Cache successful results. On primary failure, check and call the fallback once. Never substitute a rate of `1` when both fail.

### Trade integration

For trade creation, authenticate, validate, fetch the portfolio with an ownership check, and treat `portfolio.currency` as authoritative. Resolve the instrument and both conversion legs before calling `calculatePnL`, then store the metadata and calculation snapshot.

Use local conversions before provider calls:

- Quote currency equals account currency: rate `1`, source `IDENTITY`.
- Base currency equals account currency: rate `1 / instrumentPrice`, source `INSTRUMENT_PRICE`.
- Otherwise, resolve the quote-to-account rate through the FX service.

Trade updates must merge the validated patch with the stored trade and invalidate only what changed. Notes, confidence, mistake, setup, tags, and screenshots make no FX calls. Quantity, fees, and side reuse stored conversions. Date changes refresh only the affected external rate. Price changes recompute instrument-price conversion locally and reuse external rates if the timestamp is unchanged. Symbol or portfolio changes re-resolve both legs.

### Imports and portfolio currency

Broker-reported `netPnl` remains authoritative. Such imports make no FX calls and use `BROKER_REPORTED` snapshot metadata without invented conversion rates.

For imports without broker P&L, calculate rows that need only local conversion. If a row requires an external rate, skip automatic P&L calculation and return a warning. Bulk imports must not become FX API batch jobs.

Reject portfolio currency changes after the portfolio has trades or cash-flow activity. Use the message from the plan and do not migrate historical values.

## Tests and acceptance criteria

Mock all network requests. Cover Twelve Data request parameters and parsing, 429 without retry, timeout, invalid responses, fallback, cache reuse, and provider configuration. Cover zero provider calls for EURUSD/USD, USDJPY/USD, broker imports, quantity edits, and note edits. EURJPY/USD may call Twelve Data at most once per distinct entry or exit minute on the first calculation.

Phase 2 is complete when:

- The migration works and existing trade rows remain valid.
- Twelve Data is primary and Frankfurter fallback works.
- Historical conversions persist and cache hits avoid network calls.
- Local conversions never call a provider.
- Trade ownership and portfolio ownership are enforced.
- Trade edits invalidate only the required conversion leg.
- Broker P&L remains unchanged and bulk imports cannot trigger uncontrolled FX traffic.
- Portfolio currency cannot change after activity.
- Analytics continue reading stored account-currency `netPnl` without FX calls.
- Tests and the production build pass, and verification reports the known Biome baseline without unrelated cleanup.

## Boundaries

Do not add WebSockets, streaming prices, order execution, margin or leverage calculations, Redis, scheduled refreshes, background synchronization, a tick database, generic provider abstractions, or automatic historical portfolio conversion. Phase 3 UI and calculator work is out of scope.
