# StonkJournal — Feature Inventory

Date: 2026-08-06
Scope: public marketing site only (app itself is behind login at `v2.stonkjournal.com`).

Sources fetched:
- https://stonkjournal.com/ (landing, incl. `#features`, `#pricing`, `#faq` anchors — all one page)
- https://stonkjournal.com/blog
- https://stonkjournal.com/articles/best-free-trading-journals-2026
- https://stonkjournal.com/articles/best-options-trading-journal
- https://stonkjournal.com/articles/stonkjournal-vs-tradezella

No dedicated pricing/features/docs/changelog pages exist — everything is anchors on the landing page plus a blog. The site rendered fine for fetching (no JS-only blocking).

VERIFIED = stated on the site. INFERRED = my reading, not stated.

## 1. Pricing / tier structure (VERIFIED, landing `#pricing` + `#faq`)

| | Free | Pro |
|---|---|---|
| Price | $0, no credit card, no trial | $10/month |
| Trades | Unlimited | Unlimited |
| Accounts | Unlimited | Unlimited |
| Markets | Stocks, options, futures, forex | same |
| Multi-leg options | Yes | Yes |
| Stats / filtering / risk rules | Yes | Yes |
| CSV import | No | Yes |
| AI Coach | No | Yes |
| AI Chat (query trades) | No | Yes |
| Multi-account rollup dashboard | No | Yes |

What gates free: **feature locks only**. No row limit, no account limit, no history window, no ad model. The only real free-tier constraint is manual trade entry (no CSV, no broker sync).
What Pro unlocks: import, the two AI surfaces, and the aggregated cross-account dashboard.

Not offered on either tier (VERIFIED absence / stated roadmap): broker sync is "roadmap". Data export is never mentioned; one article says the AI Chat replaces "pivot tables… exports", which reads as no export feature (INFERRED).

## 2. Feature inventory by area

### Trade entry
| Feature | What it does | Tier |
|---|---|---|
| Manual trade entry | Speed-optimized manual logging form | Free |
| Multi-execution legs | Multiple partial entries/exits on one position, blended entry/exit price and net realized P&L auto-computed | Free |
| Multi-leg options | Verticals, condors, butterflies, calendars, straddles, naked — auto-detected and stored as one trade | Free |
| Options fields | Strike, expiration, contract multiplier as standard fields; multiplier applied in P&L math | Free |
| Multi-market | Stocks, options, futures, forex with correct contract multipliers | Free |
| Deposits & withdrawals | Logged as account transactions | Free |
| Chat-based logging | Natural-language entry, e.g. logging a long with size and price in one sentence | Pro (AI Coach) |

### Imports
| Feature | What it does | Tier |
|---|---|---|
| CSV / "Smart Import" | Upload any broker export; importer auto-maps columns | Pro |
| Broker sync | Direct broker connection | Not shipped — stated roadmap |

### Analytics / reporting
| Feature | What it does | Tier |
|---|---|---|
| 30+ metrics | Win rate, profit factor, total P&L, avg win, avg loss, hold time, drawdown | Free |
| Dimensional breakdowns | By symbol, day-of-week, time-of-day | Free |
| Hold time tracking | Duration stats per trade | Free |
| Rule-violation metrics | Compliance rate feeding into stats | Free |
| Behavioral leak metrics | Patterns ranked by dollar impact, with confidence scores | Pro (AI) |
| Multi-account rollup | Aggregated view across all accounts | Pro |
| Multi-currency / forex rates | Normalizes across currencies | Free (INFERRED tier — mentioned in review aggregators, not on the site's own tier table) |

### Charting
| Feature | Tier |
|---|---|
| Daily P&L calendar heatmap, month view with drill-down into a day | Free |
| Equity curve | Free |
| Per-rule sparklines showing discipline trend over time | Free |

Note: no price-chart / trade-replay / screenshot-annotation charting is described. Image attachments on entries are mentioned in third-party listings but not on the site (INFERRED).

### Risk rules / discipline
| Feature | Tier |
|---|---|
| 10 configurable rule types — examples shown: max risk per trade (%), max position size (%), min risk-reward ratio, daily loss cap | Free |
| Real-time compliance flagging at trade entry, weighted scoring | Free |
| Prop-firm oriented rules: drawdown limits, daily loss caps, position sizing, pre-trade checks | Free |
| Trade setup / risk-reward calculator | Free (INFERRED tier) |

### Tagging & journaling
| Feature | Tier |
|---|---|
| Trade-level tags, incl. structured mistake tags | Free |
| Tag filtering with AND/OR logic | Free |
| Daily notes | Free |
| Setup / strategy journaling | Free |
| Confidence meter on entries | Free (INFERRED — third-party listing, not on site) |

### Filtering
Universal server-side filters combining symbol, status, market type, direction, tags, P&L range, date range, and rule compliance. Free.

### Accounts / portfolios
Unlimited accounts to separate paper vs live, cash/IRA/futures, brokers, strategies, prop-firm accounts. Free. The *aggregated* cross-account dashboard is Pro.

### Sharing
Opt-in public share links, revocable; regenerating the link immediately invalidates the old URL. Tier unclear (listed as a free-plan item in one article, absent from the pricing table).

### AI
| Feature | What it does | Tier |
|---|---|---|
| AI Coach | Surfaces behavioral leaks (e.g. disposition effect, revenge sizing, day-of-week variance) ranked by cost | Pro |
| AI Chat | Plain-English questions over your own trades, returns actual trade rows | Pro |
| Conversational trade logging | See trade entry | Pro |

Explicitly framed as analysis of your own history only — the site states it does not predict markets or give trade advice.

### Mobile / platform
Offline-first PWA, installable on mobile and desktop, syncs when back online. No native iOS/Android app is claimed. Free.

### Alerts
No alerting/notification feature found anywhere on the site. Closest thing is real-time rule-violation flagging inside the entry form.

### Privacy / account
Site states data is not sold, users can stay anonymous, share links revocable. Live chat support mentioned in third-party listings only.

## 3. Uncertain / could not verify

- **The app itself** — everything is behind `v2.stonkjournal.com/login`. All feature detail below is marketing copy, not observed UI.
- **The full 10 rule types** — only 4 are named on the page; the other 6 are counted but not listed.
- **The "30+ metrics" list** — about 10 are named; the rest is an unenumerated claim.
- **Sharing tier** — appears in an article's free-plan list but not in the pricing table.
- **Image attachments, confidence meter, live chat support, multi-currency, tag management, trade setup tool** — these come from third-party directory listings (GetApp/Capterra/SourceForge summaries) rather than StonkJournal's own pages. Tier attribution for them is a guess.
- **Data export** — never mentioned. Cannot confirm whether it exists at all.
- **Greeks, assignment/exercise handling** — the options article raises them as things a journal should handle but does not say StonkJournal implements them.
- **Changelog / docs** — none published publicly, so no version history or shipped-feature timeline is verifiable.
