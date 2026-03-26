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

## Terminology

Throughout this spec, the terms **strategy** and **setup** refer to the same concept. The database column is `setupId` (integer FK to the `strategies` table). In UI copy and component naming, use "strategy."

---

## 1. Trade Detail Slide-Over

### Overview

A shadcn `Sheet` opens from `journal.tsx` when any table row is clicked. Uses `side="right"` with `w-full sm:max-w-lg` — full-screen on mobile, side panel on desktop.

**Header:** symbol + side badge (LONG/SHORT) + status chip + close button.
**Body:** Scrollable, split into three tabs: **Overview**, **Notes**, **Images**.

### Overview Tab Fields

All fields editable inline:
- Entry/exit price, entry/exit dates, quantity, fees
- Net P&L (read-only, calculated from entry/exit/quantity/fees)
- Confidence selector: HIGH / MEDIUM / LOW
- Mistake dropdown: FOMO, Revenge Trading, Oversize, Early Exit, etc.
- Strategy selector: dropdown from user's strategies; includes "None" option (sets `setupId = null`)

### Notes Tab

Plain `Textarea` for notes. No markdown rendering (avoid adding a dependency). The field supports freeform text.

### Images Tab

Drag-and-drop zone (reusing react-dropzone pattern from `ImportZone`). Thumbnail grid of existing screenshots. Upload and delete flows defined in Section 2.

### Server Functions

| Function | Status | Description |
|---|---|---|
| `updateTrade` | Extend | Add confidence, mistake, setupId, notes to accepted input. Psychology-only field updates (`confidence`, `mistake`, `setupId`, `notes`) must not alter `netPnl` or `returnPercent`. |
| `getSignedUploadUrl` | New | Generates GCP signed URL — must verify requesting user owns tradeId before issuing |
| `saveTradeImage` | New | Appends GCP URL to screenshots jsonb — validates URL matches `https://storage.googleapis.com/{GCP_BUCKET_NAME}/trades/{session.user.id}/{tradeId}/` |
| `deleteTradeImage` | New | Verifies user owns tradeId, removes URL from jsonb array, deletes GCP object |

---

## 2. GCP Image Upload Backend

### Upload Flow

1. User selects/drops image in the Images tab
2. Client calls `getSignedUploadUrl({ tradeId, fileName, contentType })`
3. Server verifies the requesting user owns `tradeId` (query trades where `id = tradeId AND userId = session.user.id`; reject if not found)
4. Server generates a GCP v4 signed URL (15-min expiry) using the GCP Storage REST API (see Cloudflare compatibility note below)
5. Client uploads file **directly to GCP** via `PUT` to the signed URL (no file bytes pass through the server)
6. On upload success, the client constructs the **permanent public URL** (`https://storage.googleapis.com/{GCP_BUCKET_NAME}/trades/{userId}/{tradeId}/{fileName}`) — not the signed URL — and calls `saveTradeImage({ tradeId, url })` with that permanent URL
7. Server validates `url` matches the pattern `https://storage.googleapis.com/{GCP_BUCKET_NAME}/trades/{session.user.id}/{tradeId}/` before appending to `screenshots` — this prevents storing URLs from other users' paths or external domains
8. UI refreshes thumbnail grid

### GCP Object Naming Convention

Objects are stored as `trades/{userId}/{tradeId}/{fileName}`. The GCP public URL format is:
```
https://storage.googleapis.com/{GCP_BUCKET_NAME}/trades/{userId}/{tradeId}/{fileName}
```

`deleteTradeImage` derives the object name by stripping the bucket URL prefix:
```
objectName = url.replace(`https://storage.googleapis.com/${GCP_BUCKET_NAME}/`, "")
```

### Cloudflare Workers Compatibility

**Do not use `@google-cloud/storage`** — the Node.js GCP SDK has known incompatibilities with the Cloudflare Workers runtime (missing `fs`, `http` module shims even with `nodejs_compat`).

Instead, sign requests using the **GCP Storage JSON REST API** with `fetch()` and the **Web Crypto API** for **RSA-SHA256 signing**. GCP v4 signed URLs require RSA-SHA256 when using a service account key — not HMAC-SHA256.

**Private key extraction steps:**
1. Base64-decode `GCP_SERVICE_ACCOUNT_KEY` → `JSON.parse()` → extract `.private_key` (a PEM string with literal `\n` characters)
2. Unescape `\n` → strip PEM armor (`-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`) → base64-decode the body → `ArrayBuffer`
3. Import via `crypto.subtle.importKey("pkcs8", keyBuffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])`
4. Sign the canonical string with `crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, stringToSign)`

The signed URL spec (v4) is documented at: https://cloud.google.com/storage/docs/authentication/signatures

### GCP Configuration

- Bucket with public read access (for serving images via public URL)
- Service account with `storage.objects.create` and `storage.objects.delete` permissions
- Environment variables — **must be stored as Cloudflare Worker secrets** via `wrangler secret put`, NOT as plaintext vars in `wrangler.jsonc`:
  - `GCP_PROJECT_ID`
  - `GCP_BUCKET_NAME`
  - `GCP_SERVICE_ACCOUNT_KEY` (base64-encoded JSON of the service account key file)

### Constraints

- Max file size: 10MB per image
- Accepted types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Max images per trade: 10

---

## 3. Calendar View

### Route

`/calendar` — new route in `_authenticated/` group, linked from sidebar.

### Layout

Monthly grid calendar with:
- Prev/next month navigation arrows (updates URL params)
- "Today" button (navigates to current month)
- Month/year heading

### Day Cells

Each day with trades shows:
- Net P&L for the day — sum of `netPnl` from **closed trades only** (open trades excluded from P&L sum, but counted in trade count)
- Trade count badge (e.g., "3 trades") — includes both open and closed trades
- Up to 3 symbol chips with `+N more` overflow indicator
- Cell background tinted green/red based on day P&L (neutral/no tint if P&L is $0 or only open trades exist)

### Day Click Behavior

Opens a popover listing all trades for that day. Each row shows: symbol, side, status, P&L (or "Open" if no exit), and a button to open the trade detail slide-over.

### URL State

`?year=2025&month=3` — navigating months updates the URL.

### Data

New server function `getCalendarData({ year, month })`:
- **Grouping key:** `exitDate` for closed trades, `entryDate` for open trades (trades with no exit). A closed trade always appears on the calendar day of its `exitDate`, regardless of when it was entered.
- Fetches all trades where `exitDate` falls in the month range (closed) OR `entryDate` falls in the month range and `exitDate` is null (open)
- Returns map of `date → { netPnl: number, tradeCount: number, trades: Array<{ id, symbol, side, status, netPnl: number | null }> }` — a projection, not full trade objects, to keep payload small. `netPnl` is `null` for open trades (no exit price); the UI treats `null` as the "Open" display case
- No prefetching of adjacent months (deferred — optimize only when needed)

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
| Strategy | Dropdown from user's strategies (includes "None" option to filter trades with no strategy) |
| Confidence | Multi-select: HIGH / MEDIUM / LOW |
| Mistake | Multi-select dropdown of mistake types |

### URL State & Pagination

Each filter maps to a search param (e.g., `?symbol=AAPL&side=LONG&confidence=HIGH,MEDIUM`). Page state: `?page=2` (page size: 50).

**On any filter change, page resets to 1.**

### Server Response Shape

`getTrades` returns:
```ts
{
  trades: Trade[],       // current page results
  total: number,         // total matching records (for pagination controls)
  page: number,
  pageSize: number,
}
```

Pagination UI: numbered page controls (not infinite scroll).

### UX Details

- "Clear all filters" button appears when any filter is active
- Each active filter renders as a dismissible chip below the filter bar
- Filtering done in SQL via Drizzle `where` clauses — not client-side

---

## 5. Advanced Analytics

### Placement

New sections added to the existing `/dashboard` route below the current equity curve.

### Risk Metrics — Stat Cards (new row above charts)

| Metric | Calculation |
|---|---|
| Max Drawdown | Largest peak-to-trough drop in equity curve ($ and %) — computed in-process from sorted closed trades |
| Sharpe Ratio | Closed trades are grouped by `exitDate` calendar day to produce a daily P&L series. Days with no closed trades are excluded (not treated as 0-return days). Sharpe = `mean(daily returns) / stddev(daily returns) * sqrt(252)`. Risk-free rate: 0. Annualization factor: 252 trading days (US equities standard). |
| Avg Risk/Reward | Mean `|avg winning trade netPnl| / |avg losing trade netPnl|` across closed trades |
| Avg Hold Time | Mean duration (hours) between entry and exit dates across closed trades |

### Performance by Dimension — Charts

All rendered with Recharts (existing dependency). Layout: 2-column responsive grid.

| Chart | X-axis | Y-axis | Unassigned handling |
|---|---|---|---|
| By Strategy | Strategy name | Win rate + avg P&L per bar | Trades with `setupId = null` grouped into an "Unassigned" bucket |
| By Symbol | Symbol (top 10 by trade count) | Total P&L + trade count | N/A |
| By Day of Week | Mon–Fri | Avg P&L | N/A |
| By Time of Day | Hourly buckets (entry hour) | Avg P&L | N/A |

### Data

New server function `getAdvancedAnalytics()`:
- Fetches all closed trades for the user and computes all metrics **in-process** (JavaScript, not SQL aggregates) — consistent with the pattern in existing `getAnalytics`
- Returns a single structured object with all chart data and metric values
- React Query cache: 5-minute stale time

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

**Empty state:** Centered prompt: "Create your first strategy to start categorizing trades."

### Server Functions

| Function | Status | Description |
|---|---|---|
| `getStrategies` | New | Fetches all strategies for the authenticated user |
| `createStrategy` | New | Creates strategy with name + description |
| `updateStrategy` | New | Updates name/description by id (verifies user owns the strategy) |
| `deleteStrategy` | New | Wrapped in a single DB transaction: (1) `UPDATE trades SET setupId = NULL WHERE setupId = :id AND userId = :userId`, then (2) `DELETE FROM strategies WHERE id = :id AND userId = :userId` |

---

## Architecture Summary

- **State management:** URL search params for all filters and navigation state (shareable, bookmarkable)
- **Data fetching:** TanStack React Query wrapping TanStack Start server functions
- **Image storage:** GCP Cloud Storage with signed URL direct upload via REST API + Web Crypto (no `@google-cloud/storage`)
- **GCP secrets:** Stored as Cloudflare Worker secrets (`wrangler secret put`), not in `wrangler.jsonc`
- **UI components:** shadcn/ui Sheet (`side="right"`, full-screen mobile), Dialog, Tabs, Badge, Popover
- **New routes:** `/calendar`, `/strategies`
- **Extended routes:** `/journal` (filter bar + trade detail sheet), `/dashboard` (advanced analytics sections)
- **New server functions:** `getSignedUploadUrl`, `saveTradeImage`, `deleteTradeImage`, `getCalendarData`, `getAdvancedAnalytics`, `getStrategies`, `createStrategy`, `updateStrategy`, `deleteStrategy`
