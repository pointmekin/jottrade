# Metric definitions

This file defines each performance metric in JotTrade. The code is in `src/lib/analytics.ts` and `src/lib/finance.ts`. The in-app definitions (the info buttons) use the same words.

## Scope

- **Account.** Every metric reads one account (portfolio). The dashboard and the strategy page use the active account.
- **Period.** The dashboard reads the selected period. A trade belongs to the period of its exit time. A closed trade without an exit time uses its entry time. The strategy page is always all time.
- **Day.** A day is a civil day in the browser timezone. The calendar and the charts use the same day.
- **Currency.** Money is in the account currency.

## Trade outcomes

- A trade is **realized** when its status is `CLOSED`. `OPEN` and `PENDING` trades are not in any P&L total.
- **Win**: net P&L > 0. **Loss**: net P&L < 0. **Breakeven (scratch)**: net P&L = 0.
- **Win rate** = wins ÷ (wins + losses). Breakeven trades are out of the numerator and the denominator, because a scratch is neither a win nor a loss. Every screen uses this rule. With no win and no loss, the win rate is unavailable (`—`).
- **Profit factor** = gross profit ÷ gross loss. It is unavailable with no loss.

## Two curves

| Curve | Moves with | Does not move with |
|---|---|---|
| Balance | trades, broker adjustments, deposits, withdrawals | — |
| Trading P&L | trades, broker adjustments | deposits, withdrawals |

Broker adjustments (swaps, dividends) are trading results, so they are in Net P&L. A deposit or a withdrawal changes the balance only. The equity chart shows either curve.

## Risk metrics

- **Max drawdown** is the largest fall of trading P&L from an earlier high. A deposit or a withdrawal moves the high by the same amount as the balance. Thus a cash flow never creates or hides a drawdown. The percent divides the fall by the balance at the high. It is unavailable when that balance is not positive.
- **Sharpe (realized)** is the annualized Sharpe ratio of daily account returns.
  - A day's return = trading P&L of the day ÷ (previous balance + same-day deposits and withdrawals).
  - Eligible days are every weekday from the first to the last active day, plus active weekend days. An idle weekday is a zero return. A day without positive capital is not eligible.
  - Risk-free rate is 0. The standard deviation is the sample one (n − 1). Annualization is √252.
  - It is unavailable below 20 eligible days, or when every return is equal. The app shows the day count.
  - Only realized P&L counts. Open positions are not marked to market, so the value can be higher than a mark-to-market Sharpe.
- **Payoff ratio** = average win ÷ absolute average loss. Breakeven trades are out. It is unavailable without at least one win and one loss. It is not a reward-to-risk ratio.
- **R-multiple** is P&L ÷ initial risk to the stop. The journal does not record a stop at entry, so the app does not show R.
- **Avg hold time** is the mean time from entry to exit of the closed trades in the period.

## Returns

| Name | Formula | Where |
|---|---|---|
| Price return | signed (exit − entry) ÷ entry × 100 | Stored as `return_percent` for imported and manual trades. Shown in the journal. |
| Notional return | net P&L ÷ entry notional in account currency × 100 | Not shown. Manual trades stored it before issue #8. |
| Account return | net P&L ÷ account balance at entry × 100 | Not shown yet. |

"Signed" means the sign flips for a short, so a profitable short has a positive price return. Price return ignores fees, leverage, swaps and currency conversion.

## Strategy totals

The dashboard strategy chart and the strategy page use one aggregation, `summarizeGroup`. The strategy page reads every closed trade of the strategy on the server, so it does not depend on journal pages. With the dashboard period set to "All time", both screens show the same trade count, average P&L and win rate. The test "strategy reconciliation fixture" in `src/test/analytics.test.ts` checks this on 80 trades.
