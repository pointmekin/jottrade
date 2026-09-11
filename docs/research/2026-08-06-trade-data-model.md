# Trade Data Model — Research Notes

Date: 2026-08-06
Question: what fields does a trade record need, what is derived from what, and what structural decisions does that imply?

## Sources

| Ref | URL | Used for |
|-----|-----|----------|
| S1 | https://stonkjournal.com/articles/trading-journal-template | Core field list, options fields, metric list |
| S2 | https://stonkjournal.com/articles/best-options-trading-journal | Multi-leg options fields, fill aggregation, partial fills |
| S3 | https://stonkjournal.com/articles/what-is-profit-factor-in-trading | Profit factor, expectancy, R-multiple definitions |
| S4 | https://stonkjournal.com/articles/trading-journal-why-its-important-and-how-to-keep-one | Psychological / execution-quality fields, review cadence |
| S5 | https://stonkjournal.com/articles/how-to-journal-your-trades | Field list, expectancy, hold-time metrics |
| S6 | `src/db/schema.ts` (this repo) | Current implemented model, for gap comparison |

Marking convention: **VERIFIED** = stated by a cited source. **INFERRED** = my reasoning, not in the sources. The stonkjournal articles are marketing-adjacent explainers; they are precise about *which* fields matter and vague about *how* values are computed. Where they are vague I say so rather than inventing a definition.

---

## 1. Field inventory

E = entered by the user (or imported from a broker fill), D = derived.

### 1a. Identity and context

| Field | Type | Example | E/D | Status |
|---|---|---|---|---|
| tradeId | id | `4821` | D (system) | INFERRED |
| userId / portfolioId | id | `pf_robinhood` | E | VERIFIED (S6 — multiple broker accounts per user) |
| symbol | string | `AAPL` | E | VERIFIED (S1, S5) |
| assetClass | enum | `STOCK` | E | INFERRED (implied by S1/S2 splitting stock vs options fields) |
| direction / side | enum long\|short | `LONG` | E | VERIFIED (S1, S5) |
| setup / strategy | ref | `Gap fill` | E | VERIFIED (S1 "Setup", S5 "Setup type") |
| status | enum open\|closed | `CLOSED` | D from whether remaining qty = 0 | INFERRED |

### 1b. Execution economics

| Field | Type | Example | E/D | Status |
|---|---|---|---|---|
| entryDate / entryTime | timestamp | `2026-08-06T13:42:10Z` | E | VERIFIED (S1 date; S5 "entry/exit price and time") |
| exitDate / exitTime | timestamp | `2026-08-06T15:02:00Z` | E | VERIFIED (S5) |
| entryPrice | decimal | `189.42` | E for a single fill; **D** (weighted average) when built from multiple fills | VERIFIED (S2: journal should "calculate your actual average entry, average exit") |
| exitPrice | decimal | `192.10` | E or D, same as above | VERIFIED (S2) |
| quantity / size | decimal | `200` | E | VERIFIED (S1, S5) |
| stopLoss (planned) | decimal | `187.00` | E | VERIFIED (S1) |
| target (planned exit) | decimal | `195.00` | E | VERIFIED (S5 — "planned vs. actual exit comparison") |
| commissions / fees | decimal | `1.30` | E (or imported) | PARTIAL — S3 notes gross profit factor ignores commissions, so fees are acknowledged as a real quantity, but no source specifies a fee field or a gross-vs-net convention |
| grossPnl | decimal | `536.00` | D | INFERRED (needed to make S3's gross profit factor computable) |
| netPnl ($) | decimal | `534.70` | D | VERIFIED as a field (S1 "P&L ($)"); its gross/net treatment is unspecified |
| returnPercent | decimal | `1.41` | D | INFERRED (present in S6; not in sources) |
| outcome win\|loss\|breakeven | enum | `WIN` | D from P&L sign | VERIFIED that win/loss classification exists (win rate, S3); the breakeven / exactly-zero case is **not defined by any source** |
| holdingPeriod | duration | `1h 20m` | D = exit − entry | VERIFIED as a metric ("average hold time by outcome", S5); no formula given for multi-exit trades |
| riskPerShare | decimal | `2.42` | D = \|entry − stop\| | INFERRED |
| initialRisk (R) | decimal | `484.00` | D = riskPerShare × qty | INFERRED — see §2 for why this matters |
| rMultiple | decimal | `1.10` | D | AMBIGUOUS — see §2 |

### 1c. Options-specific (S1, S2)

| Field | Type | Example | E/D | Status |
|---|---|---|---|---|
| contractType | enum call\|put | `CALL` | E | VERIFIED (S1, S2) |
| strike | decimal | `190` | E | VERIFIED |
| expiration | date | `2026-08-21` | E | VERIFIED |
| multiplier | int | `100` | E (usually a constant per contract) | VERIFIED (S1) |
| optionsStrategy | enum | `IRON_CONDOR` | E | VERIFIED (S2) |
| dteAtEntry | int | `15` | D = expiration − entryDate (date-level) | VERIFIED as a field (S1, S2); listed as "DTE at entry", derivable |
| ivRank / ivPercentile at entry | decimal | `38` | E (market snapshot, cannot be recomputed later) | VERIFIED (S2) |
| maxProfit / maxLoss | decimal | `320 / -680` | D for defined-risk structures, E otherwise | VERIFIED (S2) |
| legs[] | collection | 4 legs of a condor | E | VERIFIED (S2 — "an iron condor is four contracts opened simultaneously") |
| exitReason | enum | `ASSIGNMENT` | E | VERIFIED (S2: profit target, stop hit, time stop, adjustment, assignment) |

### 1d. Subjective / behavioural (S1, S4, S5)

| Field | Type | Example | E/D | Status |
|---|---|---|---|---|
| executionRating | int 1–5 | `5` | E | VERIFIED (S1, S4, S5). S4 is explicit that this is independent of outcome: "a disciplined loss is a 5; an undisciplined win is a 1" |
| reasoning | short text | one sentence why | E | VERIFIED (S4) |
| emotionalState | tag | `anxious` | E | VERIFIED (S4, S5 — "one-word descriptor") |
| distractionLevel | scale | `high` | E | VERIFIED (S4) — no scale defined |
| mistake tag | tag | `revenge trading` | E | VERIFIED in S6; S4 discusses post-loss behaviour but does not name a field |
| notes | markdown | — | E | INFERRED (S6) |
| screenshots | url[] | — | E | INFERRED (S6) |
| tags | string[] | `["earnings"]` | E | INFERRED |

### 1e. Import plumbing (S2 aggregation, repo S6)

| Field | Type | E/D | Status |
|---|---|---|---|
| brokerSource | enum (Schwab, Fidelity, E*TRADE, Webull, Robinhood, IBKR, custom CSV) | E | VERIFIED (S2/S3-comparison article lists these CSV sources) |
| importHash (dedupe key) | string | D | INFERRED (S6) |
| rawFillPayload | json | E | INFERRED |

### 1f. Gap vs the current repo model

`src/db/schema.ts` today stores one flat row per trade with single `entryPrice` / `exitPrice` / `quantity`, plus `fees`, `netPnl`, `returnPercent`, `mistake`, `confidence`, `notes`, `screenshots`. Relative to the sources it is missing: stop loss / planned target, execution rating, emotional state, all options fields, and any fill-level table. INFERRED assessment: the flat row is a *round-trip* model with no fill decomposition, so partial exits and multi-leg options cannot currently be represented without lossy averaging.

---

## 2. Derived metrics and formulas

Sources: S3 (primary for formulas), S1, S5.

| Metric | Formula | Status / caveats |
|---|---|---|
| Average P&L per trade | total P&L ÷ number of trades | VERIFIED (S1, quoted) |
| Win rate | winning trades ÷ total trades | VERIFIED conceptually (S3). **Ambiguous:** breakeven trades — include in denominator, exclude, or count as losses? No source says. Also unspecified whether "winning" is judged on gross or net-of-fees P&L |
| Loss rate | 1 − win rate | INFERRED (implied by the expectancy formula's use of both terms) |
| Average win | Σ P&L of winners ÷ count of winners | VERIFIED (S3, as a concept) |
| Average loss | Σ \|P&L\| of losers ÷ count of losers | VERIFIED. **Ambiguous:** sign convention — whether avg loss is stored positive and subtracted, or negative and added. The expectancy formula below only works if it is a positive magnitude |
| Profit factor | total gross profit ÷ total gross loss | VERIFIED (S3, quoted). Caveat stated by S3: "gross profit factor doesn't account for commissions and fees" — matters for high-frequency strategies. **Ambiguous:** undefined when gross loss = 0. S5 offers a rule of thumb: above 1.5 is solid, below 1.0 is losing |
| Expectancy | (win rate × avg win) − (loss rate × avg loss) | VERIFIED (S3, S5, quoted). S3 caveat: it "scales with position size", so it is not comparable across accounts. **INFERRED fix:** an R-normalised expectancy (expectancy ÷ average initial risk) is the comparable version, but no source states this |
| R-multiple | S3 defines it as "the ratio of your average winner to your average loser" | **AMBIGUOUS and conflicting with common usage.** The mainstream convention (Van Tharp lineage) is per-trade: R-multiple = trade P&L ÷ initial risk, where initial risk = \|entry − stop\| × size. S3's definition is a portfolio-level win/loss ratio — a different quantity with the same name. A model must pick one and name it explicitly; storing a per-trade `rMultiple` requires a stop-loss field, and is undefined for trades entered without a stop |
| Max drawdown | **not defined by any source consulted.** Standard definition (INFERRED): max over time of (running peak equity − current equity), reported in $ or as % of peak | Ambiguous by convention: closed-trade equity curve vs mark-to-market intraday equity give materially different numbers |
| Average hold time by outcome | mean(exit − entry) grouped by win/loss | VERIFIED as a metric (S5). Formula for multi-exit trades unspecified |
| Performance by time of day | P&L grouped by entry-time bucket | VERIFIED (S1, S4, S5). Requires a timezone decision — see §3 |
| Performance by setup / by symbol | P&L grouped by setup or symbol | VERIFIED (S4, S5) |
| Average execution rating | mean of 1–5 ratings | VERIFIED (S1) |
| Average trades per day | trade count ÷ number of trading days | VERIFIED (S1). Ambiguous: calendar days, days with ≥1 trade, or market sessions? |
| Equity curve | running cumulative P&L | VERIFIED as a feature (S3-comparison article); no formula given, and closed-trade vs mark-to-market is unspecified |

---

## 3. Modelling questions this raises

All questions below are INFERRED — they are structural decisions the field lists imply but the sources do not resolve. S2 is the only source that touches any of them.

| # | Question | What the sources actually say |
|---|---|---|
| 1 | **Is a trade a fill or a round trip?** | S2 comes down clearly on round-trip: a journal should match "executions into one trade and calculate your actual average entry, average exit, and realized P&L across all of them." That implies a two-level model: `executions/fills` (immutable, imported) → `trades` (derived aggregate). It does *not* say what defines a trade boundary — flat-to-flat? same symbol + same day? A position that goes flat and is re-entered 10 minutes later: one trade or two? Undefined |
| 2 | **Partial entries / scaling in and out** | VERIFIED as a required capability (S2: "scale into a position across three partial fills, close it in two separate exits" with net P&L computed automatically). Unresolved: cost-basis convention for partial exits — weighted average vs FIFO vs LIFO. These give different realized P&L per partial exit, and brokers/tax lots typically use FIFO while journals typically use weighted average. Must be an explicit decision |
| 3 | **Which exit price does "the" exit price mean?** | S1 has a single `exit price` field; S2 says compute a blended average. So `exitPrice` on a round trip is derived, not entered, whenever there is more than one exit |
| 4 | **Multi-leg options** | S2 requires legs be tracked as one unified trade (spreads, condors, butterflies, straddles). Unresolved: is a leg a first-class row with its own fills (3 levels: fill → leg → trade), or is a trade just a set of fills tagged with contract metadata (2 levels)? Also unresolved: rolls and adjustments — is a rolled condor the same trade or a new one linked to the old? S2 lists "adjustment" as an exit reason, which hints at closure + relink but does not say |
| 5 | **Shorts** | `direction` is a verified field, but no source states the P&L sign convention. Short P&L = (entry − exit) × qty; a signed-quantity model (negative qty for shorts) makes one formula work for both but breaks naive `SUM(quantity)` reporting. Choose one |
| 6 | **Fees / commissions / slippage** | Weakest area in the sources. Only S3 mentions commissions, and only to warn that profit factor excludes them. Nothing on: per-fill vs per-trade fee attribution, fee breakdown (commission / exchange / regulatory / borrow / financing / funding), or whether headline P&L is gross or net. Slippage (planned entry vs actual fill) is never discussed, though S5's "planned vs actual exit" field is the raw material for it |
| 7 | **Multiple currencies** | Not discussed anywhere in the sources. The repo already has `portfolios.currency` (S6). Open: does P&L get stored in instrument currency, portfolio currency, or both, and at which FX rate — trade-time or reporting-time? Cross-portfolio aggregate stats are meaningless without a rule |
| 8 | **Timezones** | Not discussed, yet "performance by time of day" is one of the most-cited metrics (S1, S4, S5). Storing UTC instants is necessary but not sufficient — the *bucketing* must happen in a chosen zone (exchange local, user local, or fixed market open offset). Multi-market or travelling users make this visible. Also needs a trading-day boundary rule for futures/crypto sessions that cross midnight |
| 9 | **Store vs recompute derived values** | Every derived field can be recomputed from fills. Storing them (as S6 does for `netPnl`) is a read-performance choice that creates staleness risk when a fill or fee is corrected later. Needs an explicit invalidation story |
| 10 | **Trades without a stop** | If `rMultiple` uses initial risk, trades entered with no stop have no R. Nullable metric, or fall back to a per-trade risk assumption? |
| 11 | **Import identity and corrections** | S2/S3 confirm CSV import from several brokers. Dedupe key, broker amendments/cancels, and reconciling a user-typed trade with a later-imported fill for the same position are all unaddressed |
| 12 | **Open positions in metrics** | Win rate, expectancy and profit factor are closed-trade metrics. Whether open positions contribute unrealized P&L to the equity curve is never stated |

---

## 4. Asset-class variations

S1 and S2 explicitly separate stock fields from options fields; futures, forex and crypto are **not covered by any source consulted**. That row set is INFERRED from general market structure — treat it as a starting hypothesis, not sourced fact.

| Concern | Stocks (VERIFIED S1) | Options (VERIFIED S1, S2) | Futures (INFERRED) | Forex (INFERRED) | Crypto (INFERRED) |
|---|---|---|---|---|---|
| Instrument identity | ticker | ticker + type + strike + expiration | root + contract month | currency pair | base/quote pair, per-venue |
| Quantity unit | shares (often integral) | contracts | contracts | lots or base units | fractional coin amounts — needs high decimal precision |
| Multiplier | 1 | 100 (field exists in S1) | per-contract point value, varies by product | lot size (e.g. 100k) | 1 |
| P&L formula | (exit − entry) × qty × side | same × multiplier, per leg, summed | (exit − entry) × ticks × tick value | pip value × lots, plus quote-currency conversion | (exit − entry) × qty |
| Extra entered fields | — | contract type, strike, expiry, strategy, IV rank, max profit/loss, exit reason incl. assignment | tick size, tick value, expiry/rollover | pip size, leverage, swap/rollover interest | funding rate (perps), leverage, venue |
| Extra derived fields | — | DTE at entry, blended per-leg entry/exit | days to contract expiry | — | — |
| Fee shape | commission + regulatory fees | per-contract commission + per-leg exchange fees | per-side commission + exchange/NFA fees | spread-embedded + swap | maker/taker bps + network/withdrawal fees + funding payments |
| Expiry / lifecycle events | none (corporate actions: splits, dividends) | expiration, exercise, assignment, roll — S2 says these "require dedicated handling beyond manual buy/sell entries" (VERIFIED) | contract rollover | rollover interest | perpetual funding accrual |
| Currency | usually single | usually single | product-dependent | inherently two currencies per trade | often quoted in USDT/stablecoin, not USD |
| Shorting | borrow fee, locate | short options = undefined-risk cases where maxLoss is entered not derived | symmetric, no borrow | symmetric | funding-rate-dependent |

The strongest asset-class signal in the sources: options are the case that breaks a flat one-row-per-trade model, because a single position is several contracts opened simultaneously across several fills (S2). Any model that satisfies options satisfies stocks trivially; the reverse is false.

---

## Confidence summary

- **VERIFIED and solid:** the field inventory itself, the fill→trade aggregation requirement, options field set, execution-rating-independent-of-outcome idea, profit factor and expectancy formulas.
- **VERIFIED but under-specified:** win rate (breakeven handling), P&L gross vs net, hold time with multiple exits.
- **Contradictory:** R-multiple — S3's definition (avg winner ÷ avg loser) differs from the common per-trade P&L ÷ initial-risk definition.
- **Absent from sources entirely:** max drawdown, currencies, timezones, slippage, cost-basis convention (FIFO/LIFO/average), tax lots, open-position treatment, futures/forex/crypto specifics.
