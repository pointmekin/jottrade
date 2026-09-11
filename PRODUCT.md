# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is an individual trader managing and reviewing their own trading activity. The initial product is primarily for its creator's personal use.

## Product Purpose

JotTrade is a private trading journal for manually recording trades or importing them from supported brokers, then reviewing performance, trading behavior, and strategy effectiveness. It should grow into a feature-complete journal that helps the user understand past decisions and improve future trading.

## Positioning

Use StonkJournal as the product reference: a free, simple trading journal that keeps routine trade capture and review approachable. JotTrade extends that model around the user's own broker workflow, beginning with Exness imports, while retaining simplicity as capabilities expand.

## Operating Context

The user records trades manually or imports broker data, currently from Exness through its MT4/MT5 CSV export format. They review results through a dashboard, performance statistics, a journal, strategies, and a calendar. Keyboard shortcuts should make frequent interactions faster.

## Capabilities and Constraints

Current product capabilities evidenced in the repository include:

- Email/password and Google authentication for private user data.
- Manual trade entry and editing.
- MT4/MT5 CSV import compatible with the current Exness workflow, including import preview.
- A dashboard with balance, P&L, active-trade, win-rate, profit-factor, equity-curve, risk, and performance analysis.
- A trade journal with filtering and trade details.
- A trading calendar grouped by day.
- Strategy management and strategy-level analysis.
- Multiple portfolios in the data model.
- Light and dark themes.
- A position/setup calculator.

Planned capabilities include:

- Broader, feature-complete dashboard, statistics, calendar, and data-import workflows.
- AI-assisted features.
- TradingView market-data integration.
- Trade planning, position sizing, and P&L calculators.
- Currency conversion.
- TradingView's freely available chart, economic-calendar, and technical-rating integrations, subject to the services and terms available when implemented.

Future features must preserve a simple and intuitive core workflow. Desktop and mobile layouts are both required product surfaces. The product should support efficient keyboard interaction where the platform permits it.

## Brand Commitments

The current product name is JotTrade. The interface should be minimal, clean, robust, intuitive, and customizable.

Vercel's product interface is the primary design-language reference: restrained color, crisp hierarchy, compact navigation, thin dividers, information-dense operational layouts, and clear data presentation. The supplied dark Vercel Observability screenshots are the primary visual evidence.

The supplied Lexend dashboard and Glide software-systems images are secondary inspiration. They may inform strong grid structure, technical precision, selective color, and information grouping, but must not override the Vercel-led language or turn the product into a marketing-page aesthetic.

## Evidence on Hand

- The current application in `src/` demonstrates the authenticated journal, dashboard and statistics, calendar, strategies, settings, and calculator workflows.
- `src/components/journal/ImportZone.tsx` implements the MT4/MT5 CSV mapping used for Exness exports.
- `src/server/importActions.ts` validates and imports mapped trades.
- `src/db/schema.ts` defines private user, portfolio, trade, and strategy records.
- `docs/research/2026-08-06-stonkjournal-feature-inventory.md` is the product-feature reference for StonkJournal. Its evidence labels and uncertainty notes must be preserved when drawing comparisons; it does not prove behavior hidden behind StonkJournal's login.
- `/Users/dhanabordeemekintharanggur/Documents/Screenshots/Screenshot 2569-09-11 at 23.48.26.png` and `/Users/dhanabordeemekintharanggur/Documents/Screenshots/Screenshot 2569-09-11 at 23.48.16.png` capture the primary Vercel interface reference.
- The supplied Lexend dark dashboard and Glide light software-systems images are secondary visual inspiration. Their temporary clipboard paths are deliberately omitted because they are not durable project assets.
- No testimonials, customer claims, usage benchmarks, pricing claims, or third-party endorsements have been provided; future work must not fabricate them.

## Product Principles

1. Keep trade capture fast whether the user enters a trade manually or imports broker data.
2. Turn recorded trades into clear, actionable insight about performance, behavior, and strategy.
3. Add capability without making the everyday journal workflow feel complex.
4. Make frequent actions efficient through sensible information architecture and keyboard access.
5. Treat desktop and mobile as complete, coherent experiences.

## Accessibility & Inclusion

Core workflows must work with keyboard input and have clear focus behavior. Interfaces must remain usable and understandable across desktop and mobile screen sizes.
