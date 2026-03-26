# Trading Journal — Full Feature Design

**Date:** 2026-03-26
**Approach:** URL-state filters, server-computed analytics, GCP image storage

---

## Scope

Six feature areas, built in priority order:

1. Trade detail slide-over (edit, notes, images, psychology fields)
2. GCP Cloud Storage image upload backend
3. Calendar view
4. Journal filtering & categorization
5. Advanced analytics
6. Strategy CRUD screen

---

## 1. Trade Detail Slide-Over

### Overview

A shadcn `Sheet` opens from `journal.tsx` when any table row is clicked. Uses the existing Sheet component already in the codebase.

**Layout:** Full-width on mobile, `max-w-lg` on desktop. Header shows symbol + side badge (LONG/SHORT) + status chip + close button. Scrollable body split into three tabs:

- **Overview** — all editable trade fields
- **Notes** — rich textarea with markdown preview toggle
- **Images** — drag-and-drop upload + thumbnail grid

### Overview Tab Fields

All fields editable inline:
- Entry/exit price, entry/exit dates, quantity, fees
- Net P&L (read-only, calculated)
- Confidence selector: HIGH / MEDIUM / LOW
- Mistake dropdown: FOMO, Revenge Trading, Oversize, Early Exit, etc.
- Strategy selector: linked to user's strategies table

### Notes Tab

Upgrades the existing plain `Input` to a `Textarea`. Toggle between edit mode and markdown-rendered preview.

### Images Tab

Drag-and-drop zone (reusing react-dropzone pattern from existing `ImportZone`). Thumbnail grid of existing screenshots. Deleting an image removes it from GCP and from the trade's `screenshots` jsonb array.

### Server Functions

| Function | Status | Description |
|---|---|---|
| `updateTrade` | Exists | Extended to include confidence, mistake, setupId, notes |
| `getSignedUploadUrl` | New | Generates GCP v4 signed URL for direct upload |
| `saveTradeImage` | New | Appends public GCP URL to screenshots jsonb array |
| `deleteTradeImage` | New | Removes URL from jsonb array + deletes from GCP |

---

## 2. GCP Image Upload Backend

### Upload Flow

1. User selects/drops image in the Images tab
2. Client calls `getSignedUploadUrl({ tradeId, fileName, contentType })`
3. Server generates a GCP signed URL (v4, 15-min expiry) using service account credentials
4. Client uploads file **directly to GCP** via `PUT` to the signed URL (no file bytes pass through the server)
5. On success, client calls `saveTradeImage({ tradeId, url })` — appends public URL to `screenshots` jsonb array
6. UI refreshes thumbnail grid

### GCP Configuration

- Bucket with public read access for serving images
- Service account with `storage.objects.create` and `storage.objects.delete` permissions
- Environment variables required:
  - `GCP_PROJECT_ID`
  - `GCP_BUCKET_NAME`
  - `GCP_SERVICE_ACCOUNT_KEY` (base64-encoded JSON)

### Constraints

- Max file size: 10MB per image
- Accepted types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

### New Dependency

`@google-cloud/storage`

---

## 3. Calendar View

### Route

`/calendar` — new route in `_authenticated/` group, linked from sidebar.

### Layout

Monthly grid calendar with:
- Prev/next month navigation arrows
- "Today" button
- Month/year heading

### Day Cells

Each day with trades shows:
- Net P&L for the day (green = profit, red = loss)
- Trade count badge (e.g., "3 trades")
- Up to 3 symbol chips (e.g., `AAPL`, `TSLA`) with `+N more` overflow indicator
- Cell background tinted green/red based on day profitability

### Day Click Behavior

Opens a popover/sheet listing all trades for that day. Each row shows: symbol, side, P&L, and a link that opens the trade detail slide-over.

### URL State

`?year=2025&month=3` — navigating months updates the URL, making views shareable and bookmarkable.

### Data

New server function `getCalendarData({ year, month })`:
- Fetches all trades in the date range
- Groups by exit date (closed trades) and entry date (open trades)
- Returns map of `date → { netPnl, trades[] }`
- React Query caches per month; adjacent months prefetched via `prefetchQuery`

---

## 4. Journal Filtering & Categorization

### Filter Bar

Appears above the journal table. On mobile: collapsed behind a "Filters" button showing active filter count badge.

### Filter Fields

| Field | Control |
|---|---|
| Date range | Two date pickers (from/to) using existing react-day-picker |
| Symbol | Text input with 300ms debounce |
| Side | Toggle: All / LONG / SHORT |
| Status | Toggle: All / Open / Closed / Pending |
| Strategy | Dropdown from user's strategies |
| Confidence | Multi-select: HIGH / MEDIUM / LOW |
| Mistake | Multi-select dropdown of mistake types |

### URL State

Each filter maps to a search param (e.g., `?symbol=AAPL&side=LONG&confidence=HIGH,MEDIUM`). Filters persist on refresh and are shareable. Pagination: `?page=2` (page size 50).

### UX Details

- "Clear all filters" button appears when any filter is active
- Each active filter renders as a dismissible chip below the filter bar

### Server Side

`getTrades` extended to accept all filter params. Filtering done in SQL via Drizzle `where` clauses — not client-side.

---

## 5. Advanced Analytics

### Placement

New sections added to the existing `/dashboard` route below the current equity curve. No new route.

### Performance by Dimension — Charts

All rendered with Recharts (existing dependency):

| Chart | X-axis | Y-axis |
|---|---|---|
| By Strategy | Strategy name | Win rate + avg P&L |
| By Symbol | Symbol (top 10) | Total P&L + trade count |
| By Day of Week | Mon–Fri | Avg P&L |
| By Time of Day | Hourly buckets | Avg P&L |

Layout: 2-column responsive grid.

### Risk Metrics — Stat Cards

New row of cards above the charts:

| Metric | Calculation |
|---|---|
| Max Drawdown | Largest peak-to-trough drop in equity curve ($ and %) |
| Sharpe Ratio | Annualized, using daily P&L returns vs risk-free rate of 0 |
| Avg Risk/Reward | Mean `|wins| / |losses|` across closed trades |
| Avg Hold Time | Mean duration between entry and exit dates |

### Data

New server function `getAdvancedAnalytics()`:
- Computes all metrics server-side from closed trades
- Returns structured object consumed by Recharts components
- React Query cache: 5-minute stale time (consistent with existing `getAnalytics`)

---

## 6. Strategy CRUD Screen

### Route

`/strategies` — new route in `_authenticated/` group, linked from sidebar.

### Layout

Two-panel on desktop, stacked on mobile.

**Left panel — Strategy list:**
- List of strategies with name + description preview
- "New Strategy" button at top
- Clicking a strategy loads it in the right panel
- Delete button per row with confirmation dialog

**Right panel — Strategy detail/edit form:**
- Fields: Name (required), Description (textarea)
- Save button (create or update)
- Performance summary below the form: total trades, win rate, avg P&L, total P&L — filtered from trades by `setupId`

**Empty state:** Centered prompt when no strategies exist: "Create your first strategy to start categorizing trades."

### Server Functions

| Function | Status | Description |
|---|---|---|
| `getStrategies` | New | Fetches all user strategies |
| `createStrategy` | New | Creates strategy with name + description |
| `updateStrategy` | New | Updates name/description by id |
| `deleteStrategy` | New | Deletes strategy; nullifies `setupId` on associated trades |

---

## Architecture Summary

- **State management:** URL search params for all filters and navigation state (shareable, bookmarkable)
- **Data fetching:** TanStack React Query wrapping TanStack Start server functions (consistent with existing patterns)
- **Image storage:** GCP Cloud Storage with signed URL direct upload (no file bytes through server)
- **UI components:** shadcn/ui Sheet, Dialog, Tabs, Badge, Popover — all within existing component library
- **New routes:** `/calendar`, `/strategies`
- **Extended routes:** `/journal` (filter bar, trade detail sheet), `/dashboard` (advanced analytics sections)
- **New server functions:** `getSignedUploadUrl`, `saveTradeImage`, `deleteTradeImage`, `getCalendarData`, `getAdvancedAnalytics`, `getStrategies`, `createStrategy`, `updateStrategy`, `deleteStrategy`
