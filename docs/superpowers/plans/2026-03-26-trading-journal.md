# Trading Journal Full Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement strategy CRUD, trade detail slide-over with GCP image upload, journal filtering with server-side pagination, calendar view, and advanced analytics.

**Architecture:** URL-state filters via TanStack Router search params; server functions compute all data; GCP images uploaded directly from browser via RSA-SHA256 signed URLs using Web Crypto API (Cloudflare Workers compatible); pure analytics functions isolated in `src/lib/analytics.ts` for testability.

**Tech Stack:** TanStack Start server functions (`createServerFn`), TanStack Router search params, TanStack React Query v5, React Hook Form + Zod, Drizzle ORM + Neon PostgreSQL, shadcn/ui (Sheet, Tabs, Dialog, Popover, Badge), Recharts, react-dropzone, Vitest.

---

## Existing Patterns to Follow

- Server fn auth: `await auth.api.getSession({ headers: getRequestHeaders() })`
- Server fn data: `const data = ctx.data as SomeType` (no `.validator()` chaining used)
- Zod: `schema.parse(ctx.data)` manually inside handler
- Import style: `@/` alias for `src/`
- Styling: dark zinc theme (`bg-zinc-950`, `border-zinc-800`, `text-zinc-400`)

---

## File Map

**New files:**

| File | Responsibility |
|------|----------------|
| `src/lib/analytics.ts` | Pure functions: groupByDay, computeSharpe, computeMaxDrawdown, computeAvgRR, computeAvgHoldTime |
| `src/lib/gcp.ts` | GCP v4 signed URL generator using Web Crypto RSA-SHA256 |
| `src/server/strategyActions.ts` | getStrategies, createStrategy, updateStrategy, deleteStrategy |
| `src/server/imageActions.ts` | getSignedUploadUrl, saveTradeImage, deleteTradeImage |
| `src/server/calendarActions.ts` | getCalendarData |
| `src/server/getAdvancedAnalytics.ts` | getAdvancedAnalytics |
| `src/components/strategies/StrategyList.tsx` | Left panel: list + delete |
| `src/components/strategies/StrategyForm.tsx` | Right panel: create/edit form + performance summary |
| `src/components/journal/TradeDetailSheet.tsx` | Slide-over: Overview / Notes / Images tabs |
| `src/components/journal/FilterBar.tsx` | Filter controls reading/writing URL search params |
| `src/components/calendar/CalendarGrid.tsx` | Monthly grid layout + navigation |
| `src/components/calendar/CalendarDayCell.tsx` | Individual day cell (P&L, badges, symbols) |
| `src/components/calendar/DayTradesPopover.tsx` | Popover listing trades for a clicked day |
| `src/components/dashboard/RiskMetrics.tsx` | Sharpe, drawdown, R:R, hold time cards |
| `src/components/dashboard/PerformanceCharts.tsx` | By-strategy/symbol/dow/hour Recharts grids |
| `src/routes/_authenticated/strategies.tsx` | Strategies page route |
| `src/routes/_authenticated/calendar.tsx` | Calendar page route |
| `src/test/analytics.test.ts` | Vitest unit tests for analytics.ts |

**Modified files:**

| File | Changes |
|------|---------|
| `src/server/tradeActions.ts` | Add confidence, mistake, setupId to updateTrade schema |
| `src/server/getTrades.ts` | Add filter params, server-side pagination, paginated response shape |
| `src/components/journal/JournalTable.tsx` | Add `onRowClick` prop; remove client-side pagination (server handles it) |
| `src/routes/_authenticated/journal.tsx` | Add FilterBar, TradeDetailSheet, server-side pagination controls |
| `src/routes/_authenticated/dashboard.tsx` | Add RiskMetrics + PerformanceCharts below equity curve |
| `src/components/app-sidebar.tsx` | Add Strategies nav item (Calendar already present) |

---

## Phase 0: Database Migration

### Task 0: Verify schema and run migration

The `strategies` table and new `trades` columns (`confidence`, `mistake`, `setupId`, `screenshots`) already exist in `src/db/schema.ts`. Confirm they exist in the actual database before any other phase.

**Files:**
- Read: `src/db/schema.ts` (verify columns exist)

- [ ] **Step 1: Check schema has required tables and columns**

Open `src/db/schema.ts`. Confirm:
- `strategies` table exists with `id`, `userId`, `name`, `description`
- `trades` table has: `setupId`, `mistake`, `confidence`, `notes`, `screenshots`

If any are missing, add them to the schema file following the existing column definition patterns.

- [ ] **Step 2: Push schema to database**

```bash
npm run db:push
```

Expected: no errors. If migration errors occur, run `npm run db:generate` first then `npm run db:migrate`.

- [ ] **Step 3: Commit if schema changes were needed**

```bash
git add src/db/schema.ts drizzle/
git commit -m "chore: ensure strategies table and trade psychology columns exist"
```

---

## Phase 1: Analytics Library

### Task 1: Pure analytics functions + tests

**Files:**
- Create: `src/lib/analytics.ts`
- Create: `src/test/analytics.test.ts`

- [ ] **Step 1: Create `src/lib/analytics.ts`**

```typescript
export type ClosedTrade = {
  exitDate: Date;
  entryDate: Date;
  netPnl: number;
};

/** Groups closed trades by exit date (YYYY-MM-DD). Returns date → sum of netPnl. */
export function groupByDay(trades: ClosedTrade[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const trade of trades) {
    const key = trade.exitDate.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + trade.netPnl);
  }
  return map;
}

/**
 * Annualized Sharpe ratio from a daily P&L map.
 * Excludes zero-trade days. Risk-free rate = 0. Annualization = sqrt(252).
 */
export function computeSharpe(dailyPnl: Map<string, number>): number {
  const values = Array.from(dailyPnl.values());
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Use sample stddev (n-1) — required for unbiased Sharpe ratio estimation
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return 0;
  return (mean / stddev) * Math.sqrt(252);
}

/**
 * Largest peak-to-trough drawdown from trades sorted by exitDate asc.
 * Returns { dollars, percent }.
 */
export function computeMaxDrawdown(
  trades: ClosedTrade[],
  initialBalance: number
): { dollars: number; percent: number } {
  let peak = initialBalance;
  let balance = initialBalance;
  let maxDd = 0;
  let maxDdPct = 0;
  for (const trade of trades) {
    balance += trade.netPnl;
    if (balance > peak) peak = balance;
    const dd = peak - balance;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDd) { maxDd = dd; maxDdPct = ddPct; }
  }
  return { dollars: maxDd, percent: maxDdPct };
}

/** Avg win / |avg loss| across closed trades. Returns 0 if no wins or no losses. */
export function computeAvgRR(trades: ClosedTrade[]): number {
  const wins = trades.filter(t => t.netPnl > 0);
  const losses = trades.filter(t => t.netPnl < 0);
  if (!wins.length || !losses.length) return 0;
  const avgWin = wins.reduce((a, t) => a + t.netPnl, 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((a, t) => a + t.netPnl, 0) / losses.length);
  return avgLoss === 0 ? 0 : avgWin / avgLoss;
}

/** Mean hold duration in hours across closed trades. */
export function computeAvgHoldTime(trades: ClosedTrade[]): number {
  if (!trades.length) return 0;
  const totalHours = trades.reduce(
    (acc, t) => acc + (t.exitDate.getTime() - t.entryDate.getTime()) / 3_600_000,
    0
  );
  return totalHours / trades.length;
}
```

- [ ] **Step 2: Create `src/test/analytics.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  groupByDay, computeSharpe, computeMaxDrawdown, computeAvgRR, computeAvgHoldTime,
} from '../lib/analytics';

const t = (exitISO: string, entryISO: string, pnl: number) => ({
  exitDate: new Date(exitISO),
  entryDate: new Date(entryISO),
  netPnl: pnl,
});

describe('groupByDay', () => {
  it('sums P&L per exit date', () => {
    const trades = [
      t('2025-01-01T10:00:00Z', '2025-01-01T09:00:00Z', 100),
      t('2025-01-01T14:00:00Z', '2025-01-01T09:00:00Z', 50),
      t('2025-01-02T10:00:00Z', '2025-01-02T09:00:00Z', -30),
    ];
    const result = groupByDay(trades);
    expect(result.get('2025-01-01')).toBe(150);
    expect(result.get('2025-01-02')).toBe(-30);
  });
});

describe('computeSharpe', () => {
  it('returns 0 for < 2 data points', () => {
    expect(computeSharpe(new Map([['2025-01-01', 100]]))).toBe(0);
  });
  it('returns 0 when stddev is 0', () => {
    expect(computeSharpe(new Map([['a', 100], ['b', 100]]))).toBe(0);
  });
  it('returns positive for consistently positive returns', () => {
    const map = new Map([['a', 100], ['b', 200], ['c', 150]]);
    expect(computeSharpe(map)).toBeGreaterThan(0);
  });
  it('uses sample stddev (n-1)', () => {
    // With 2 points [0, 100]: mean=50, sample stddev=70.71, sharpe = (50/70.71)*sqrt(252) ≈ 11.22
    const map = new Map([['a', 0], ['b', 100]]);
    expect(computeSharpe(map)).toBeCloseTo(11.22, 0);
  });
});

describe('computeMaxDrawdown', () => {
  it('returns zeros for no trades', () => {
    expect(computeMaxDrawdown([], 10000)).toEqual({ dollars: 0, percent: 0 });
  });
  it('computes peak-to-trough correctly', () => {
    const trades = [
      t('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 1000),  // balance 11000, peak 11000
      t('2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z', -2000), // balance 9000, dd 2000
      t('2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z', 500),   // balance 9500
    ];
    const { dollars, percent } = computeMaxDrawdown(trades, 10000);
    expect(dollars).toBe(2000);
    expect(percent).toBeCloseTo(18.18, 1);
  });
});

describe('computeAvgRR', () => {
  it('returns 0 with no losses', () => {
    expect(computeAvgRR([t('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 100)])).toBe(0);
  });
  it('computes ratio correctly', () => {
    const trades = [
      t('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 200),
      t('2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z', 100),
      t('2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z', -100),
    ];
    expect(computeAvgRR(trades)).toBe(1.5); // avgWin=150, avgLoss=100
  });
});

describe('computeAvgHoldTime', () => {
  it('returns 0 for empty', () => {
    expect(computeAvgHoldTime([])).toBe(0);
  });
  it('returns average hours', () => {
    const trades = [
      t('2025-01-01T10:00:00Z', '2025-01-01T08:00:00Z', 100), // 2h
      t('2025-01-02T12:00:00Z', '2025-01-02T08:00:00Z', 50),  // 4h
    ];
    expect(computeAvgHoldTime(trades)).toBe(3);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/test/analytics.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics.ts src/test/analytics.test.ts
git commit -m "feat: add pure analytics calculation functions with tests"
```

---

## Phase 2: Strategy CRUD

### Task 2: Strategy server functions

**Files:**
- Create: `src/server/strategyActions.ts`

- [ ] **Step 1: Create `src/server/strategyActions.ts`**

```typescript
import { createServerFn } from '@tanstack/react-start';
import { db } from '@/db';
import { strategies, trades } from '@/db/schema';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';

export const getStrategies = createServerFn({ method: 'GET' })
  .handler(async () => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');
    return db.select().from(strategies).where(eq(strategies.userId, session.user.id));
  });

const createStrategySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
});

export const createStrategy = createServerFn({ method: 'POST' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');
    const data = createStrategySchema.parse(ctx.data);
    const [strategy] = await db.insert(strategies)
      .values({ userId: session.user.id, name: data.name, description: data.description })
      .returning();
    return strategy;
  });

const updateStrategySchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
});

export const updateStrategy = createServerFn({ method: 'POST' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');
    const data = updateStrategySchema.parse(ctx.data);
    const [strategy] = await db.update(strategies)
      .set({ name: data.name, description: data.description })
      .where(and(eq(strategies.id, data.id), eq(strategies.userId, session.user.id)))
      .returning();
    if (!strategy) throw new Error('Strategy not found');
    return strategy;
  });

export const deleteStrategy = createServerFn({ method: 'POST' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');
    const { id } = z.object({ id: z.number() }).parse(ctx.data);
    // Transaction: nullify FK references first, then delete
    await db.transaction(async (tx) => {
      await tx.update(trades)
        .set({ setupId: null })
        .where(and(eq(trades.setupId, id), eq(trades.userId, session.user.id)));
      await tx.delete(strategies)
        .where(and(eq(strategies.id, id), eq(strategies.userId, session.user.id)));
    });
    return { success: true };
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/strategyActions.ts
git commit -m "feat: add strategy server functions (CRUD + transactional delete)"
```

### Task 3: Strategies route + components

**Files:**
- Create: `src/components/strategies/StrategyList.tsx`
- Create: `src/components/strategies/StrategyForm.tsx`
- Create: `src/routes/_authenticated/strategies.tsx`

- [ ] **Step 1: Create `src/components/strategies/StrategyList.tsx`**

```typescript
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteStrategy } from '@/server/strategyActions';

type Strategy = { id: number; name: string; description: string | null };

interface StrategyListProps {
  strategies: Strategy[];
  selectedId: number | null;
  onSelect: (s: Strategy) => void;
}

export function StrategyList({ strategies, selectedId, onSelect }: StrategyListProps) {
  const qc = useQueryClient();
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteStrategy({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strategies'] }),
  });

  if (!strategies.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-sm">
        No strategies yet. Create your first one.
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {strategies.map((s) => (
        <li
          key={s.id}
          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer group
            ${selectedId === s.id ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}
          onClick={() => onSelect(s)}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{s.name}</p>
            {s.description && (
              <p className="text-xs text-zinc-500 truncate">{s.description}</p>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete strategy?</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  All trades using "{s.name}" will have their strategy cleared. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-zinc-700">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => deleteMut.mutate(s.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Create `src/components/strategies/StrategyForm.tsx`**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { createStrategy, updateStrategy } from '@/server/strategyActions';
import { getTrades } from '@/server/getTrades';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(1000).optional(),
});
type FormValues = z.infer<typeof schema>;

type Strategy = { id: number; name: string; description: string | null };

interface StrategyFormProps {
  strategy: Strategy | null; // null = creating new
  onSaved: (s: Strategy) => void;
}

export function StrategyForm({ strategy, onSaved }: StrategyFormProps) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { name: strategy?.name ?? '', description: strategy?.description ?? '' },
  });

  const saveMut = useMutation({
    mutationFn: (values: FormValues) =>
      strategy
        ? updateStrategy({ data: { id: strategy.id, ...values } })
        : createStrategy({ data: values }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['strategies'] });
      onSaved(saved as Strategy);
      if (!strategy) reset();
    },
  });

  // Performance summary for existing strategy
  const { data: allTrades } = useQuery({
    queryKey: ['trades'],
    queryFn: () => getTrades({ data: undefined }),
    enabled: !!strategy,
  });
  // getTrades returns { trades, total, page, pageSize } — destructure accordingly
  const stratTrades = ((allTrades as any)?.trades as any[] | undefined)?.filter(
    (t: any) => t.setupId === strategy?.id && t.status === 'CLOSED'
  ) ?? [];
  const totalPnl = stratTrades.reduce((a: number, t: any) => a + Number(t.netPnl ?? 0), 0);
  const winRate = stratTrades.length
    ? (stratTrades.filter((t: any) => Number(t.netPnl) > 0).length / stratTrades.length) * 100
    : 0;

  return (
    <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} className="space-y-4">
      <div className="space-y-1">
        <Label className="text-zinc-300">Name</Label>
        <Input {...register('name')} className="bg-zinc-900 border-zinc-700 text-white" placeholder="e.g. Breakout" />
        {errors.name && <p className="text-red-400 text-xs">{errors.name.message}</p>}
      </div>
      <div className="space-y-1">
        <Label className="text-zinc-300">Description</Label>
        <Textarea {...register('description')} className="bg-zinc-900 border-zinc-700 text-white" rows={3} placeholder="Describe this setup..." />
      </div>
      <Button type="submit" disabled={saveMut.isPending} className="w-full">
        {saveMut.isPending ? 'Saving…' : strategy ? 'Save Changes' : 'Create Strategy'}
      </Button>

      {strategy && stratTrades.length > 0 && (
        <div className="mt-6 pt-6 border-t border-zinc-800 grid grid-cols-2 gap-3">
          {[
            { label: 'Trades', value: stratTrades.length },
            { label: 'Win Rate', value: `${winRate.toFixed(1)}%` },
            { label: 'Avg P&L', value: `$${(totalPnl / stratTrades.length).toFixed(2)}` },
            { label: 'Total P&L', value: `$${totalPnl.toFixed(2)}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-zinc-900 rounded-lg p-3">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-sm font-medium text-white">{value}</p>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Create `src/routes/_authenticated/strategies.tsx`**

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getStrategies } from '@/server/strategyActions';
import { StrategyList } from '@/components/strategies/StrategyList';
import { StrategyForm } from '@/components/strategies/StrategyForm';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/strategies')({
  component: StrategiesPage,
});

type Strategy = { id: number; name: string; description: string | null };

function StrategiesPage() {
  const [selected, setSelected] = useState<Strategy | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: strategyList = [] } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => getStrategies({ data: undefined }),
  });

  const handleSelect = (s: Strategy) => { setSelected(s); setCreating(false); };
  const handleNew = () => { setSelected(null); setCreating(true); };
  const handleSaved = (s: Strategy) => { setSelected(s); setCreating(false); };

  const showForm = creating || !!selected;

  return (
    <div className="p-8 w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Strategies</h1>
          <p className="text-zinc-400">Define and manage your trading setups.</p>
        </div>
        <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />New Strategy</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Left panel */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <StrategyList
            strategies={strategyList as Strategy[]}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
          />
        </div>

        {/* Right panel */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6">
          {showForm ? (
            <>
              <h2 className="text-lg font-semibold text-white mb-6">
                {creating ? 'New Strategy' : 'Edit Strategy'}
              </h2>
              <StrategyForm strategy={selected} onSaved={handleSaved} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-sm">
              Select a strategy to edit, or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add Strategies to sidebar**

In `src/components/app-sidebar.tsx`, add to the `items` array (after the existing Calendar entry):

```typescript
import { BookOpen } from "lucide-react"; // add to imports

// In items array, add:
{
  title: "Strategies",
  url: "/strategies",
  icon: BookOpen,
},
```

- [ ] **Step 5: Verify manually**

Run `npm run dev`. Navigate to `/strategies`. Confirm:
- Empty state shows "Create your first strategy"
- Can create a strategy, it appears in the list
- Can edit a strategy name/description
- Can delete — confirms dialog, trade links cleared, strategy removed

- [ ] **Step 6: Commit**

```bash
git add src/components/strategies/ src/routes/_authenticated/strategies.tsx src/components/app-sidebar.tsx
git commit -m "feat: add strategy CRUD screen with performance summary"
```

---

## Phase 3: Trade Detail Slide-Over

### Task 4: Extend updateTrade with psychology fields

**Files:**
- Modify: `src/server/tradeActions.ts`

- [ ] **Step 1: Fix Drizzle `.set()` undefined behavior in `updateTrade`**

Drizzle does NOT skip `undefined` values in `.set()` — it sets them to NULL. Build the set object conditionally so only provided fields are updated:

```typescript
// Replace the existing .set({...}) block with:
const setValues: Record<string, any> = { status, netPnl, returnPercent };
if (validatedData.symbol !== undefined) setValues.symbol = validatedData.symbol;
if (validatedData.side !== undefined) setValues.side = validatedData.side;
if (validatedData.entryDate !== undefined) setValues.entryDate = validatedData.entryDate;
if (validatedData.entryPrice !== undefined) setValues.entryPrice = validatedData.entryPrice;
if (validatedData.quantity !== undefined) setValues.quantity = validatedData.quantity;
if (validatedData.exitDate !== undefined) setValues.exitDate = validatedData.exitDate;
if (validatedData.exitPrice !== undefined) setValues.exitPrice = validatedData.exitPrice;
if (validatedData.fees !== undefined) setValues.fees = validatedData.fees;
if (validatedData.portfolioId !== undefined) setValues.portfolioId = validatedData.portfolioId;
if (validatedData.notes !== undefined) setValues.notes = validatedData.notes;
// Psychology fields
if (validatedData.confidence !== undefined) setValues.confidence = validatedData.confidence;
if (validatedData.mistake !== undefined) setValues.mistake = validatedData.mistake;
if ('setupId' in validatedData) setValues.setupId = validatedData.setupId; // allow null

await db.update(trades).set(setValues).where(eq(trades.id, validatedData.id));
```

- [ ] **Step 2: Extend `updateTradeSchema` in `src/server/tradeActions.ts`**

Add these fields to `updateTradeSchema` (after the existing `.partial().extend({ id: z.number() })`):

```typescript
const updateTradeSchema = tradeSchema.partial().extend({
  id: z.number(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  mistake: z.string().optional(),
  setupId: z.number().nullable().optional(),
  // notes already in tradeSchema
});
```

In the `updateTrade` handler, after building the `set({...})` object, add the psychology fields. **Do not recalculate netPnl when only psychology fields change** — the existing logic already only recalculates when exit data is present, so this is safe. Just include the new fields in the `.set()` call:

```typescript
await db.update(trades)
  .set({
    // ...existing fields...
    confidence: validatedData.confidence,
    mistake: validatedData.mistake,
    setupId: validatedData.setupId,  // allow null to clear
    status,
    netPnl,
    returnPercent,
  })
  .where(eq(trades.id, validatedData.id));
```

- [ ] **Step 2: Commit**

```bash
git add src/server/tradeActions.ts
git commit -m "feat: extend updateTrade with confidence, mistake, setupId fields"
```

### Task 5: GCP signing library

**Files:**
- Create: `src/lib/gcp.ts`

- [ ] **Step 1: Create `src/lib/gcp.ts`**

```typescript
// GCP Storage v4 signed URL using Web Crypto (Cloudflare Workers compatible).
// Do NOT use @google-cloud/storage — incompatible with Workers runtime.
// Uses PATH-STYLE URLs (https://storage.googleapis.com/{bucket}/{object}).
// Ensure your GCP bucket does NOT enforce virtual-hosted-style only.

const STORAGE_HOST = 'storage.googleapis.com';

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function parseServiceAccount(): ServiceAccount {
  const raw = atob(process.env.GCP_SERVICE_ACCOUNT_KEY!);
  return JSON.parse(raw);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // PEM private_key field has literal \n — replace with actual newlines first
  const normalized = pem.replace(/\\n/g, '\n');
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
    .trim();
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function hexEncode(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return hexEncode(buf);
}

/**
 * Creates a GCP Storage v4 signed PUT URL for direct browser upload.
 * @param objectName  e.g. "trades/{userId}/{tradeId}/{fileName}"
 * @param contentType e.g. "image/jpeg"
 * @param expiresInSeconds max 604800 (7 days); default 900 (15 min)
 */
export async function createSignedUploadUrl(
  objectName: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<string> {
  const bucketName = process.env.GCP_BUCKET_NAME!;
  const sa = parseServiceAccount();
  const cryptoKey = await importPrivateKey(sa.private_key);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, ''); // HHMMSS
  const datetimeStr = `${dateStr}T${timeStr}Z`;
  const credentialScope = `${dateStr}/auto/storage/goog4_request`;
  const credential = `${sa.client_email}/${credentialScope}`;

  // Canonical query string — params sorted alphabetically by key
  const qp: [string, string][] = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', credential],
    ['X-Goog-Date', datetimeStr],
    ['X-Goog-Expires', String(expiresInSeconds)],
    ['X-Goog-SignedHeaders', 'content-type;host'],
  ].sort(([a], [b]) => a.localeCompare(b));

  const canonicalQuery = qp
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    `/${bucketName}/${objectName}`,
    canonicalQuery,
    `content-type:${contentType}\nhost:${STORAGE_HOST}\n`,
    'content-type;host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const canonicalRequestHash = await sha256Hex(canonicalRequest);

  const stringToSign = [
    'GOOG4-RSA-SHA256',
    datetimeStr,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(stringToSign)
  );

  return (
    `https://${STORAGE_HOST}/${bucketName}/${objectName}` +
    `?${canonicalQuery}&X-Goog-Signature=${hexEncode(signatureBuffer)}`
  );
}

/** Deletes an object from GCP using the JSON API with a service account Bearer token. */
export async function deleteGcpObject(objectName: string): Promise<void> {
  const bucketName = process.env.GCP_BUCKET_NAME!;
  // Get an access token via the service account credentials
  const token = await getAccessToken();
  const encodedName = encodeURIComponent(objectName);
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodedName}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`GCP delete failed: ${res.status}`);
  }
}

async function getAccessToken(): Promise<string> {
  const sa = parseServiceAccount();
  const cryptoKey = await importPrivateKey(sa.private_key);

  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const sigInput = `${header}.${payload}`;
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput)
  );
  // Use loop-based encoding — spread operator on large Uint8Array exceeds call stack in Workers
  const sigBytes = new Uint8Array(sigBuf);
  let sigB64 = '';
  for (let i = 0; i < sigBytes.length; i++) sigB64 += String.fromCharCode(sigBytes[i]);
  const jwt = `${sigInput}.${btoa(sigB64)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json() as { access_token: string };
  return json.access_token;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/gcp.ts
git commit -m "feat: add GCP signed URL utility using Web Crypto (Workers-compatible)"
```

### Task 6: Image server functions

**Files:**
- Create: `src/server/imageActions.ts`

- [ ] **Step 1: Create `src/server/imageActions.ts`**

```typescript
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trades } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { createSignedUploadUrl, deleteGcpObject } from '@/lib/gcp';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES = 10;

function buildPublicUrl(bucketName: string, objectName: string): string {
  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}

function validateImageUrl(url: string, userId: string, tradeId: number): boolean {
  const bucket = process.env.GCP_BUCKET_NAME!;
  const prefix = `https://storage.googleapis.com/${bucket}/trades/${userId}/${tradeId}/`;
  return url.startsWith(prefix);
}

export const getSignedUploadUrl = createServerFn({ method: 'POST' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const { tradeId, fileName, contentType } = z.object({
      tradeId: z.number(),
      fileName: z.string().min(1).max(255),
      contentType: z.enum(ALLOWED_TYPES as [string, ...string[]]),
    }).parse(ctx.data);

    // Verify ownership
    const [trade] = await db.select({ id: trades.id, screenshots: trades.screenshots })
      .from(trades)
      .where(and(eq(trades.id, tradeId), eq(trades.userId, session.user.id)));
    if (!trade) throw new Error('Trade not found');

    const existing = (trade.screenshots as string[] | null) ?? [];
    if (existing.length >= MAX_IMAGES) throw new Error(`Max ${MAX_IMAGES} images per trade`);

    const objectName = `trades/${session.user.id}/${tradeId}/${fileName}`;
    const signedUrl = await createSignedUploadUrl(objectName, contentType);

    return {
      signedUrl,
      publicUrl: buildPublicUrl(process.env.GCP_BUCKET_NAME!, objectName),
    };
  });

export const saveTradeImage = createServerFn({ method: 'POST' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const { tradeId, url } = z.object({
      tradeId: z.number(),
      url: z.string().url(),
    }).parse(ctx.data);

    if (!validateImageUrl(url, session.user.id, tradeId)) {
      throw new Error('Invalid image URL');
    }

    const [trade] = await db.select({ screenshots: trades.screenshots })
      .from(trades)
      .where(and(eq(trades.id, tradeId), eq(trades.userId, session.user.id)));
    if (!trade) throw new Error('Trade not found');

    const existing = (trade.screenshots as string[] | null) ?? [];
    if (existing.length >= MAX_IMAGES) throw new Error(`Max ${MAX_IMAGES} images per trade`);

    await db.update(trades)
      .set({ screenshots: [...existing, url] })
      .where(eq(trades.id, tradeId));

    return { success: true };
  });

export const deleteTradeImage = createServerFn({ method: 'POST' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const { tradeId, url } = z.object({
      tradeId: z.number(),
      url: z.string().url(),
    }).parse(ctx.data);

    // Verify ownership
    const [trade] = await db.select({ screenshots: trades.screenshots })
      .from(trades)
      .where(and(eq(trades.id, tradeId), eq(trades.userId, session.user.id)));
    if (!trade) throw new Error('Trade not found');

    if (!validateImageUrl(url, session.user.id, tradeId)) {
      throw new Error('Invalid image URL');
    }

    // Delete from GCP
    const bucket = process.env.GCP_BUCKET_NAME!;
    const objectName = url.replace(`https://storage.googleapis.com/${bucket}/`, '');
    await deleteGcpObject(objectName);

    // Remove from screenshots array
    const existing = (trade.screenshots as string[] | null) ?? [];
    await db.update(trades)
      .set({ screenshots: existing.filter((u) => u !== url) })
      .where(eq(trades.id, tradeId));

    return { success: true };
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/imageActions.ts
git commit -m "feat: add image upload server functions with GCP signed URLs"
```

### Task 7: TradeDetailSheet component

**Files:**
- Create: `src/components/journal/TradeDetailSheet.tsx`

You'll need these shadcn components if not already present:
```bash
pnpx shadcn@latest add tabs textarea select
```

- [ ] **Step 1: Create `src/components/journal/TradeDetailSheet.tsx`**

```typescript
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Trash2, Upload, X } from 'lucide-react';
import { updateTrade } from '@/server/tradeActions';
import { getSignedUploadUrl, saveTradeImage, deleteTradeImage } from '@/server/imageActions';
import { getStrategies } from '@/server/strategyActions';
import type { Trade } from './JournalTable';

const MISTAKE_OPTIONS = [
  'FOMO', 'Revenge Trading', 'Oversize Position', 'Early Exit',
  'Late Exit', 'No Trading Plan', 'Moved Stop Loss',
];

const overviewSchema = z.object({
  entryPrice: z.string(),
  exitPrice: z.string().optional(),
  quantity: z.string(),
  fees: z.string().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  mistake: z.string().optional(),
  setupId: z.string().optional(), // stringified number or "none"
});
type OverviewValues = z.infer<typeof overviewSchema>;

interface TradeDetailSheetProps {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TradeDetailSheet({ trade, open, onOpenChange }: TradeDetailSheetProps) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: strategies = [] } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => getStrategies({ data: undefined }),
  });

  const { register, handleSubmit, setValue, watch } = useForm<OverviewValues>({
    resolver: zodResolver(overviewSchema),
    values: {
      entryPrice: trade?.entryPrice ?? '',
      exitPrice: trade?.exitPrice ?? '',
      quantity: trade?.quantity ?? '',
      fees: (trade as any)?.fees ?? '',
      confidence: (trade as any)?.confidence ?? undefined,
      mistake: (trade as any)?.mistake ?? undefined,
      setupId: (trade as any)?.setupId?.toString() ?? 'none',
    },
  });

  const saveMut = useMutation({
    mutationFn: (values: OverviewValues) =>
      updateTrade({
        data: {
          id: trade!.id,
          entryPrice: values.entryPrice,
          exitPrice: values.exitPrice,
          quantity: values.quantity,
          fees: values.fees,
          confidence: values.confidence as any,
          mistake: values.mistake,
          setupId: values.setupId === 'none' ? null : Number(values.setupId),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const noteMut = useMutation({
    mutationFn: (notes: string) => updateTrade({ data: { id: trade!.id, notes } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const deleteImgMut = useMutation({
    mutationFn: (url: string) => deleteTradeImage({ data: { tradeId: trade!.id, url } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!trade || !accepted.length) return;
    setUploading(true);
    try {
      for (const file of accepted) {
        const { signedUrl, publicUrl } = await getSignedUploadUrl({
          data: { tradeId: trade.id, fileName: file.name, contentType: file.type },
        }) as { signedUrl: string; publicUrl: string };
        await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        await saveTradeImage({ data: { tradeId: trade.id, url: publicUrl } });
      }
      qc.invalidateQueries({ queryKey: ['trades'] });
    } finally {
      setUploading(false);
    }
  }, [trade, qc]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 10,
  });

  const screenshots: string[] = (trade as any)?.screenshots ?? [];
  const netPnl = trade?.netPnl ? parseFloat(trade.netPnl) : null;

  if (!trade) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-zinc-950 border-l-zinc-800 text-white overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle className="text-white text-xl">{trade.symbol}</SheetTitle>
            <Badge className={trade.side === 'LONG' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}>
              {trade.side}
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs uppercase">
              {trade.status}
            </Badge>
            {netPnl !== null && (
              <span className={`text-sm font-medium ml-auto ${netPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {netPnl >= 0 ? '+' : ''}{netPnl.toFixed(2)}
              </span>
            )}
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="images">Images {screenshots.length > 0 && `(${screenshots.length})`}</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Entry Price</Label>
                  <Input {...register('entryPrice')} className="bg-zinc-900 border-zinc-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Exit Price</Label>
                  <Input {...register('exitPrice')} className="bg-zinc-900 border-zinc-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Quantity</Label>
                  <Input {...register('quantity')} className="bg-zinc-900 border-zinc-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Fees</Label>
                  <Input {...register('fees')} className="bg-zinc-900 border-zinc-700 text-white" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Confidence</Label>
                <Select value={watch('confidence') ?? ''} onValueChange={(v) => setValue('confidence', v as any)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue placeholder="Select confidence" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {['HIGH', 'MEDIUM', 'LOW'].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Mistake</Label>
                <Select value={watch('mistake') ?? ''} onValueChange={(v) => setValue('mistake', v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue placeholder="Any mistake?" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="__none__">None</SelectItem>
                    {MISTAKE_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Strategy</Label>
                <Select value={watch('setupId') ?? 'none'} onValueChange={(v) => setValue('setupId', v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="none">None</SelectItem>
                    {(strategies as any[]).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={saveMut.isPending} className="w-full">
                {saveMut.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </form>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="mt-4 space-y-3">
            <Textarea
              defaultValue={(trade as any)?.notes ?? ''}
              className="bg-zinc-900 border-zinc-700 text-white min-h-48 resize-none"
              placeholder="Add your trade notes here…"
              onBlur={(e) => noteMut.mutate(e.target.value)}
            />
            <p className="text-xs text-zinc-600">Changes saved on blur.</p>
          </TabsContent>

          {/* Images Tab */}
          <TabsContent value="images" className="mt-4 space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700 hover:border-zinc-500'}`}
            >
              <input {...getInputProps()} />
              <Upload className="h-6 w-6 mx-auto mb-2 text-zinc-500" />
              <p className="text-sm text-zinc-400">
                {uploading ? 'Uploading…' : isDragActive ? 'Drop images here' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-xs text-zinc-600 mt-1">Max 10MB · JPEG, PNG, WebP, GIF · Up to 10 images</p>
            </div>

            {screenshots.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {screenshots.map((url) => (
                  <div key={url} className="relative group rounded-lg overflow-hidden bg-zinc-900">
                    <img src={url} alt="Trade screenshot" className="w-full h-32 object-cover" />
                    <button
                      onClick={() => deleteImgMut.mutate(url)}
                      className="absolute top-1 right-1 p-1 rounded bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/TradeDetailSheet.tsx
git commit -m "feat: add TradeDetailSheet with Overview/Notes/Images tabs"
```

### Task 8: Wire TradeDetailSheet into journal

**Files:**
- Modify: `src/components/journal/JournalTable.tsx`
- Modify: `src/routes/_authenticated/journal.tsx`

- [ ] **Step 1: Add `onRowClick` to `JournalTable`**

In `src/components/journal/JournalTable.tsx`:

1. Add `onRowClick?: (trade: Trade) => void` to `JournalTableProps`.
2. On `<TableRow>`, add `onClick={() => props.onRowClick?.(row.original)}` and `className="... cursor-pointer"`.

- [ ] **Step 2: Update `journal.tsx` to use TradeDetailSheet**

```typescript
// Add to imports:
import { TradeDetailSheet } from '@/components/journal/TradeDetailSheet';
import type { Trade } from '@/components/journal/JournalTable';

// Add inside JournalPage():
const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
const [detailOpen, setDetailOpen] = useState(false);

const handleRowClick = (trade: Trade) => {
  setSelectedTrade(trade);
  setDetailOpen(true);
};

// Add after the closing Sheet tag:
<TradeDetailSheet
  trade={selectedTrade}
  open={detailOpen}
  onOpenChange={setDetailOpen}
/>

// Pass to JournalTable:
<JournalTable data={trades || []} onRowClick={handleRowClick} />
```

- [ ] **Step 3: Verify manually**

Run `npm run dev`. Click any trade row. Confirm slide-over opens with trade data. Test saving confidence/mistake/strategy. Test note saving on blur. (GCP image upload requires env vars to be set first.)

- [ ] **Step 4: Commit**

```bash
git add src/components/journal/JournalTable.tsx src/routes/_authenticated/journal.tsx
git commit -m "feat: wire TradeDetailSheet into journal table row click"
```

---

## Phase 4: Journal Filtering

### Task 9: Extend getTrades with filters and pagination

**Files:**
- Modify: `src/server/getTrades.ts`

- [ ] **Step 1: Rewrite `src/server/getTrades.ts`**

```typescript
import { createServerFn } from '@tanstack/react-start';
import { db } from '@/db';
import { trades } from '@/db/schema';
import { eq, desc, and, like, gte, lte, inArray, isNull, count } from 'drizzle-orm';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const PAGE_SIZE = 50;

const filterSchema = z.object({
  portfolioId: z.number().optional(),
  symbol: z.string().optional(),
  side: z.enum(['LONG', 'SHORT']).optional(),
  status: z.enum(['OPEN', 'CLOSED', 'PENDING']).optional(),
  setupId: z.union([z.number(), z.literal('none')]).optional(),
  confidence: z.array(z.enum(['HIGH', 'MEDIUM', 'LOW'])).optional(),
  mistake: z.array(z.string()).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().default(1),
}).optional();

export const getTrades = createServerFn({ method: 'GET' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const data = filterSchema.parse(ctx.data ?? {}) ?? {};
    const page = data.page ?? 1;
    const offset = (page - 1) * PAGE_SIZE;

    const conditions = [eq(trades.userId, session.user.id)];

    if (data.portfolioId) conditions.push(eq(trades.portfolioId, data.portfolioId));
    if (data.symbol) conditions.push(like(trades.symbol, `%${data.symbol}%`));
    if (data.side) conditions.push(eq(trades.side, data.side));
    if (data.status) conditions.push(eq(trades.status, data.status));
    if (data.setupId === 'none') conditions.push(isNull(trades.setupId));
    else if (data.setupId !== undefined) conditions.push(eq(trades.setupId, data.setupId));
    if (data.confidence?.length) conditions.push(inArray(trades.confidence, data.confidence));
    if (data.mistake?.length) conditions.push(inArray(trades.mistake, data.mistake));
    if (data.dateFrom) conditions.push(gte(trades.entryDate, new Date(data.dateFrom)));
    if (data.dateTo) conditions.push(lte(trades.entryDate, new Date(data.dateTo)));

    const where = and(...conditions);

    const [tradeRows, [{ total }]] = await Promise.all([
      db.select().from(trades).where(where).orderBy(desc(trades.entryDate))
        .limit(PAGE_SIZE).offset(offset),
      db.select({ total: count() }).from(trades).where(where),
    ]);

    return { trades: tradeRows, total: Number(total), page, pageSize: PAGE_SIZE };
  });
```

- [ ] **Step 2: Update all call sites**

The existing `journal.tsx` calls `getTrades({ data: undefined })` and expects a plain array. Update it to destructure: `const { data: result } = useQuery(...)` and use `result?.trades ?? []`.

- [ ] **Step 3: Commit**

```bash
git add src/server/getTrades.ts
git commit -m "feat: extend getTrades with filters, pagination, and paginated response shape"
```

### Task 10: FilterBar component

**Files:**
- Create: `src/components/journal/FilterBar.tsx`

You'll need the date picker component:
```bash
pnpx shadcn@latest add popover calendar
```

- [ ] **Step 1: Create `src/components/journal/FilterBar.tsx`**

```typescript
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStrategies } from '@/server/strategyActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Filter, X } from 'lucide-react';

// Filter state read/written to URL search params
export type JournalFilters = {
  symbol?: string;
  side?: 'LONG' | 'SHORT';
  status?: 'OPEN' | 'CLOSED' | 'PENDING';
  setupId?: string; // number or "none"
  confidence?: string; // comma-separated
  mistake?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
};

interface FilterBarProps {
  filters: JournalFilters;
  onFiltersChange: (filters: JournalFilters) => void;
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [symbolInput, setSymbolInput] = useState(filters.symbol ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: strategies = [] } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => getStrategies({ data: undefined }),
  });

  const update = useCallback((patch: Partial<JournalFilters>) => {
    onFiltersChange({ ...filters, ...patch, page: 1 });
  }, [filters, onFiltersChange]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (symbolInput !== (filters.symbol ?? '')) {
        update({ symbol: symbolInput || undefined });
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [symbolInput]);

  const activeCount = [
    filters.symbol, filters.side, filters.status, filters.setupId,
    filters.confidence, filters.mistake, filters.dateFrom, filters.dateTo,
  ].filter(Boolean).length;

  const clearAll = () => {
    setSymbolInput('');
    onFiltersChange({ page: 1 });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-zinc-700 text-zinc-300"
          onClick={() => setExpanded(!expanded)}
        >
          <Filter className="h-3.5 w-3.5 mr-2" />
          Filters
          {activeCount > 0 && (
            <Badge className="ml-2 h-4 px-1.5 text-xs bg-blue-600">{activeCount}</Badge>
          )}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="text-zinc-500 h-8" onClick={clearAll}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear all
          </Button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
          {/* Symbol */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Symbol</p>
            <Input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder="AAPL"
              className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm"
            />
          </div>

          {/* Side */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Side</p>
            <div className="flex gap-1">
              {(['LONG', 'SHORT'] as const).map((s) => (
                <Button
                  key={s} size="sm" variant="outline"
                  className={`flex-1 h-8 text-xs border-zinc-700 ${filters.side === s ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
                  onClick={() => update({ side: filters.side === s ? undefined : s })}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Status</p>
            <Select
              value={filters.status ?? ''}
              onValueChange={(v) => update({ status: v as any || undefined })}
            >
              <SelectTrigger className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="__all__">All</SelectItem>
                {['OPEN', 'CLOSED', 'PENDING'].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Strategy */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Strategy</p>
            <Select
              value={filters.setupId ?? ''}
              onValueChange={(v) => update({ setupId: v || undefined })}
            >
              <SelectTrigger className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="">All</SelectItem>
                <SelectItem value="none">No Strategy</SelectItem>
                {(strategies as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Confidence */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Confidence</p>
            <div className="flex gap-1">
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((c) => {
                const active = (filters.confidence ?? '').split(',').filter(Boolean).includes(c);
                const toggle = () => {
                  const current = (filters.confidence ?? '').split(',').filter(Boolean);
                  const next = active ? current.filter((x) => x !== c) : [...current, c];
                  update({ confidence: next.join(',') || undefined });
                };
                return (
                  <Button
                    key={c} size="sm" variant="outline"
                    className={`flex-1 h-8 text-xs border-zinc-700 ${active ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
                    onClick={toggle}
                  >
                    {c[0]}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Date from */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">From</p>
            <Input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(e) => update({ dateFrom: e.target.value || undefined })}
              className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm"
            />
          </div>

          {/* Date to */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">To</p>
            <Input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(e) => update({ dateTo: e.target.value || undefined })}
              className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm"
            />
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.symbol && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-300 gap-1">
              Symbol: {filters.symbol}
              <X className="h-3 w-3 cursor-pointer" onClick={() => update({ symbol: undefined })} />
            </Badge>
          )}
          {filters.side && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-300 gap-1">
              {filters.side}
              <X className="h-3 w-3 cursor-pointer" onClick={() => update({ side: undefined })} />
            </Badge>
          )}
          {filters.status && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-300 gap-1">
              {filters.status}
              <X className="h-3 w-3 cursor-pointer" onClick={() => update({ status: undefined })} />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/FilterBar.tsx
git commit -m "feat: add FilterBar component with URL-state filter controls"
```

### Task 11: Update journal route with filters and pagination

**Files:**
- Modify: `src/routes/_authenticated/journal.tsx`

- [ ] **Step 1: Update journal route**

Replace the existing `JournalPage` with URL-param-based filtering. The route needs a `validateSearch` config:

```typescript
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
// ...existing imports...
import { FilterBar, type JournalFilters } from '@/components/journal/FilterBar';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const journalSearchSchema = z.object({
  symbol: z.string().optional(),
  side: z.enum(['LONG', 'SHORT']).optional(),
  status: z.enum(['OPEN', 'CLOSED', 'PENDING']).optional(),
  setupId: z.string().optional(),
  confidence: z.string().optional(),
  mistake: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().default(1),
});

export const Route = createFileRoute('/_authenticated/journal')({
  validateSearch: journalSearchSchema,
  component: JournalPage,
});

function JournalPage() {
  const navigate = useNavigate({ from: '/journal' });
  const search = useSearch({ from: '/_authenticated/journal' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const filters: JournalFilters = search;

  const handleFiltersChange = (newFilters: JournalFilters) => {
    navigate({ search: newFilters as any });
  };

  const queryParams = {
    symbol: filters.symbol,
    side: filters.side,
    status: filters.status,
    setupId: filters.setupId === 'none' ? 'none' : filters.setupId ? Number(filters.setupId) : undefined,
    confidence: filters.confidence?.split(',').filter(Boolean) as any,
    mistake: filters.mistake?.split(',').filter(Boolean),
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    page: filters.page ?? 1,
  };

  const { data: result, isLoading } = useQuery({
    queryKey: ['trades', queryParams],
    queryFn: () => getTrades({ data: queryParams }),
  });

  const tradeList = (result as any)?.trades ?? [];
  const total = (result as any)?.total ?? 0;
  const page = (result as any)?.page ?? 1;
  const pageSize = (result as any)?.pageSize ?? 50;
  const totalPages = Math.ceil(total / pageSize);

  const handleRowClick = (trade: any) => {
    setSelectedTrade(trade);
    setDetailOpen(true);
  };

  return (
    <div className="p-8 space-y-6 w-full">
      {/* Header with buttons — keep existing */}
      {/* ... */}

      <FilterBar filters={filters} onFiltersChange={handleFiltersChange} />

      {isLoading ? (
        <div className="flex items-center justify-center space-x-2"><Spinner /><div>Loading trades...</div></div>
      ) : (
        <>
          <JournalTable data={tradeList} onRowClick={handleRowClick} />
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-zinc-500">{total} trades · Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={page <= 1}
                  onClick={() => navigate({ search: { ...search, page: page - 1 } })}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="sm"
                  disabled={page >= totalPages}
                  onClick={() => navigate({ search: { ...search, page: page + 1 } })}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <TradeDetailSheet trade={selectedTrade} open={detailOpen} onOpenChange={setDetailOpen} />
      {/* Keep existing Import CSV dialog and Log Trade sheet */}
    </div>
  );
}
```

Also remove the `getPaginationRowModel` from `JournalTable` since pagination is now server-side. Remove the Previous/Next buttons from the table itself.

- [ ] **Step 2: Verify manually**

Run `npm run dev`. Navigate to `/journal`. Confirm:
- Filters button opens filter panel
- Typing a symbol filters after 300ms
- Toggling LONG/SHORT updates table
- Active filter chips appear and are dismissible
- "Clear all" resets filters
- Page controls appear when > 50 trades exist

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/journal.tsx src/components/journal/JournalTable.tsx
git commit -m "feat: add journal filtering and server-side pagination"
```

---

## Phase 5: Calendar View

### Task 12: Calendar server function

**Files:**
- Create: `src/server/calendarActions.ts`

- [ ] **Step 1: Create `src/server/calendarActions.ts`**

```typescript
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trades } from '@/db/schema';
import { and, eq, gte, lte, isNull } from 'drizzle-orm';
import { z } from 'zod';

export type CalendarTrade = {
  id: number;
  symbol: string;
  side: string;
  status: string;
  netPnl: number | null;
};

export type CalendarDay = {
  netPnl: number;      // sum of closed trade P&L only
  tradeCount: number;  // closed + open
  trades: CalendarTrade[];
};

export const getCalendarData = createServerFn({ method: 'GET' })
  .handler(async (ctx: any) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const { year, month } = z.object({ year: z.number(), month: z.number() }).parse(ctx.data);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // last ms of month

    // Closed trades: grouped by exitDate
    const closedTrades = await db
      .select({
        id: trades.id, symbol: trades.symbol, side: trades.side,
        status: trades.status, netPnl: trades.netPnl, exitDate: trades.exitDate,
      })
      .from(trades)
      .where(and(
        eq(trades.userId, session.user.id),
        gte(trades.exitDate, startDate),
        lte(trades.exitDate, endDate),
      ));

    // Open trades: grouped by entryDate
    const openTrades = await db
      .select({
        id: trades.id, symbol: trades.symbol, side: trades.side,
        status: trades.status, entryDate: trades.entryDate,
      })
      .from(trades)
      .where(and(
        eq(trades.userId, session.user.id),
        gte(trades.entryDate, startDate),
        lte(trades.entryDate, endDate),
        isNull(trades.exitDate),
      ));

    const result: Record<string, CalendarDay> = {};

    const ensureDay = (key: string) => {
      if (!result[key]) result[key] = { netPnl: 0, tradeCount: 0, trades: [] };
    };

    for (const t of closedTrades) {
      if (!t.exitDate) continue;
      const key = new Date(t.exitDate).toISOString().slice(0, 10);
      ensureDay(key);
      result[key].netPnl += Number(t.netPnl ?? 0);
      result[key].tradeCount += 1;
      result[key].trades.push({
        id: t.id, symbol: t.symbol, side: t.side!, status: t.status!,
        netPnl: t.netPnl !== null ? Number(t.netPnl) : null,
      });
    }

    for (const t of openTrades) {
      if (!t.entryDate) continue;
      const key = new Date(t.entryDate).toISOString().slice(0, 10);
      ensureDay(key);
      result[key].tradeCount += 1;
      result[key].trades.push({
        id: t.id, symbol: t.symbol, side: t.side!, status: t.status!, netPnl: null,
      });
    }

    return result as Record<string, CalendarDay>;
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/calendarActions.ts
git commit -m "feat: add getCalendarData server function"
```

### Task 13: Calendar route + components

**Files:**
- Create: `src/components/calendar/CalendarDayCell.tsx`
- Create: `src/components/calendar/DayTradesPopover.tsx`
- Create: `src/components/calendar/CalendarGrid.tsx`
- Create: `src/routes/_authenticated/calendar.tsx`

- [ ] **Step 1: Create `src/components/calendar/CalendarDayCell.tsx`**

```typescript
import { Badge } from '@/components/ui/badge';
import type { CalendarDay } from '@/server/calendarActions';

interface CalendarDayCellProps {
  date: string; // YYYY-MM-DD
  day: CalendarDay | undefined;
  isCurrentMonth: boolean;
  onClick: (date: string) => void;
}

export function CalendarDayCell({ date, day, isCurrentMonth, onClick }: CalendarDayCellProps) {
  const dayNum = parseInt(date.slice(8, 10), 10);
  const hasTrades = !!day && day.tradeCount > 0;
  const isProfit = hasTrades && day.netPnl > 0;
  const isLoss = hasTrades && day.netPnl < 0;

  return (
    <div
      className={`min-h-[80px] p-1.5 border-b border-r border-zinc-800 cursor-pointer transition-colors
        ${isCurrentMonth ? '' : 'opacity-30'}
        ${isProfit ? 'bg-green-500/5 hover:bg-green-500/10' : ''}
        ${isLoss ? 'bg-red-500/5 hover:bg-red-500/10' : ''}
        ${!hasTrades ? 'hover:bg-zinc-900/50' : ''}
      `}
      onClick={() => hasTrades && onClick(date)}
    >
      <p className="text-xs text-zinc-500 mb-1">{dayNum}</p>
      {hasTrades && (
        <div className="space-y-1">
          <p className={`text-xs font-medium ${isProfit ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-zinc-400'}`}>
            {day.netPnl >= 0 ? '+' : ''}${day.netPnl.toFixed(0)}
          </p>
          <p className="text-[10px] text-zinc-600">{day.tradeCount} trade{day.tradeCount !== 1 ? 's' : ''}</p>
          <div className="flex flex-wrap gap-0.5">
            {day.trades.slice(0, 3).map((t) => (
              <span key={t.id} className="text-[9px] bg-zinc-800 text-zinc-400 px-1 rounded">
                {t.symbol}
              </span>
            ))}
            {day.trades.length > 3 && (
              <span className="text-[9px] text-zinc-600">+{day.trades.length - 3}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/calendar/DayTradesPopover.tsx`**

```typescript
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import type { CalendarDay } from '@/server/calendarActions';

interface DayTradesPopoverProps {
  date: string;
  day: CalendarDay;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTradeClick: (tradeId: number) => void;
  children: React.ReactNode;
}

export function DayTradesPopover({ date, day, open, onOpenChange, onTradeClick, children }: DayTradesPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 bg-zinc-950 border-zinc-800 text-white p-3" side="right">
        <p className="text-xs text-zinc-500 mb-3">{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <div className="space-y-2">
          {day.trades.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-2 rounded bg-zinc-900 cursor-pointer hover:bg-zinc-800 transition-colors"
              onClick={() => onTradeClick(t.id)}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{t.symbol}</span>
                <Badge className={`text-[10px] h-4 px-1 ${t.side === 'LONG' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                  {t.side}
                </Badge>
              </div>
              <span className={`text-xs font-medium ${t.netPnl === null ? 'text-zinc-500' : t.netPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {t.netPnl === null ? 'Open' : `$${t.netPnl.toFixed(2)}`}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Create `src/components/calendar/CalendarGrid.tsx`**

```typescript
import { useMemo, useState } from 'react';
import { CalendarDayCell } from './CalendarDayCell';
import { DayTradesPopover } from './DayTradesPopover';
import type { CalendarDay } from '@/server/calendarActions';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarGridProps {
  year: number;
  month: number; // 1-12
  data: Record<string, CalendarDay>;
}

export function CalendarGrid({ year, month, data }: CalendarGridProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build grid: 6-week grid starting from Sunday before month start
  const days = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday

    const cells: { date: string; currentMonth: boolean }[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < 42; i++) {
      cells.push({
        date: cursor.toISOString().slice(0, 10),
        currentMonth: cursor.getMonth() === month - 1,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return cells;
  }, [year, month]);

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      {/* Day of week header */}
      <div className="grid grid-cols-7 border-b border-zinc-800">
        {DOW.map((d) => (
          <div key={d} className="py-2 text-center text-xs text-zinc-500 font-medium">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {days.map(({ date, currentMonth }) => {
          const day = data[date];
          const isSelected = selectedDate === date;

          if (day && day.tradeCount > 0) {
            return (
              <DayTradesPopover
                key={date}
                date={date}
                day={day}
                open={isSelected}
                onOpenChange={(open) => setSelectedDate(open ? date : null)}
                onTradeClick={() => setSelectedDate(null)}
              >
                <div>
                  <CalendarDayCell
                    date={date}
                    day={day}
                    isCurrentMonth={currentMonth}
                    onClick={setSelectedDate}
                  />
                </div>
              </DayTradesPopover>
            );
          }

          return (
            <CalendarDayCell
              key={date}
              date={date}
              day={undefined}
              isCurrentMonth={currentMonth}
              onClick={() => {}}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/routes/_authenticated/calendar.tsx`**

```typescript
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCalendarData } from '@/server/calendarActions';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';

const calendarSearchSchema = z.object({
  year: z.number().default(() => new Date().getFullYear()),
  month: z.number().default(() => new Date().getMonth() + 1),
});

export const Route = createFileRoute('/_authenticated/calendar')({
  validateSearch: calendarSearchSchema,
  component: CalendarPage,
});

function CalendarPage() {
  const navigate = useNavigate({ from: '/calendar' });
  const { year, month } = useSearch({ from: '/_authenticated/calendar' });

  const { data: calendarData = {}, isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => getCalendarData({ data: { year, month } }),
  });

  const goTo = (y: number, m: number) => {
    let nm = m; let ny = y;
    if (nm < 1) { nm = 12; ny -= 1; }
    if (nm > 12) { nm = 1; ny += 1; }
    navigate({ search: { year: ny, month: nm } });
  };

  const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="p-8 space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Calendar</h1>
          <p className="text-zinc-400">View your trading activity by day.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-zinc-700 h-8 w-8" onClick={() => goTo(year, month - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-white font-medium min-w-36 text-center">{monthName}</span>
          <Button variant="outline" size="icon" className="border-zinc-700 h-8 w-8" onClick={() => goTo(year, month + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline" size="sm" className="border-zinc-700 text-zinc-300 ml-2"
            onClick={() => goTo(new Date().getFullYear(), new Date().getMonth() + 1)}
          >
            Today
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-96 text-zinc-500">Loading calendar…</div>
      ) : (
        <CalendarGrid year={year} month={month} data={calendarData as any} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify manually**

Navigate to `/calendar`. Confirm:
- Current month loads with trade data
- Days with trades show P&L, count, symbols
- Green/red tinting for profit/loss days
- Clicking a day opens the popover with trade list
- Prev/next navigation updates URL and refetches

- [ ] **Step 6: Commit**

```bash
git add src/components/calendar/ src/routes/_authenticated/calendar.tsx src/server/calendarActions.ts
git commit -m "feat: add calendar view with monthly trade overview"
```

---

## Phase 6: Advanced Analytics

### Task 14: getAdvancedAnalytics server function

**Files:**
- Create: `src/server/getAdvancedAnalytics.ts`

- [ ] **Step 1: Create `src/server/getAdvancedAnalytics.ts`**

```typescript
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trades, strategies, portfolios } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import {
  groupByDay, computeSharpe, computeMaxDrawdown, computeAvgRR, computeAvgHoldTime,
  type ClosedTrade,
} from '@/lib/analytics';

function aggregateGroup(pnls: number[]) {
  if (!pnls.length) return { count: 0, totalPnl: 0, avgPnl: 0, winRate: 0 };
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  return {
    count: pnls.length,
    totalPnl,
    avgPnl: totalPnl / pnls.length,
    winRate: (pnls.filter((p) => p > 0).length / pnls.length) * 100,
  };
}

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const getAdvancedAnalytics = createServerFn({ method: 'GET' })
  .handler(async () => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) throw new Error('Unauthorized');

    const [allTrades, allStrategies, userPortfolios] = await Promise.all([
      db.select().from(trades)
        .where(and(eq(trades.userId, session.user.id), eq(trades.status, 'CLOSED')))
        .orderBy(asc(trades.exitDate)),
      db.select().from(strategies).where(eq(strategies.userId, session.user.id)),
      db.select().from(portfolios).where(eq(portfolios.userId, session.user.id)).limit(1),
    ]);

    const initialBalance = userPortfolios[0] ? Number(userPortfolios[0].initialBalance) : 10000;

    const analyticsInput: ClosedTrade[] = allTrades.map((t) => ({
      exitDate: new Date(t.exitDate!),
      entryDate: new Date(t.entryDate),
      netPnl: Number(t.netPnl ?? 0),
    }));

    const dailyPnl = groupByDay(analyticsInput);

    // Risk metrics
    const riskMetrics = {
      sharpe: computeSharpe(dailyPnl),
      maxDrawdown: computeMaxDrawdown(analyticsInput, initialBalance),
      avgRR: computeAvgRR(analyticsInput),
      avgHoldTimeHours: computeAvgHoldTime(analyticsInput),
    };

    // By strategy
    const strategyNameMap = new Map(allStrategies.map((s) => [s.id, s.name]));
    const strategyGroups: Record<string, number[]> = {};
    for (const t of allTrades) {
      const key = t.setupId ? (strategyNameMap.get(t.setupId) ?? 'Unknown') : 'Unassigned';
      if (!strategyGroups[key]) strategyGroups[key] = [];
      strategyGroups[key].push(Number(t.netPnl ?? 0));
    }
    const byStrategy = Object.entries(strategyGroups).map(([name, pnls]) => ({
      name, ...aggregateGroup(pnls),
    }));

    // By symbol (top 10)
    const symbolGroups: Record<string, number[]> = {};
    for (const t of allTrades) {
      if (!symbolGroups[t.symbol]) symbolGroups[t.symbol] = [];
      symbolGroups[t.symbol].push(Number(t.netPnl ?? 0));
    }
    const bySymbol = Object.entries(symbolGroups)
      .map(([name, pnls]) => ({ name, ...aggregateGroup(pnls) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // By day of week (Mon-Fri)
    const dowGroups: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const t of allTrades) {
      const dow = new Date(t.exitDate!).getDay();
      if (dow >= 1 && dow <= 5) dowGroups[dow].push(Number(t.netPnl ?? 0));
    }
    const byDayOfWeek = [1, 2, 3, 4, 5].map((d) => ({
      name: DOW_NAMES[d], ...aggregateGroup(dowGroups[d]),
    }));

    // By entry hour
    const hourGroups: Record<string, number[]> = {};
    for (const t of allTrades) {
      const hour = new Date(t.entryDate).getHours();
      const key = `${hour}:00`;
      if (!hourGroups[key]) hourGroups[key] = [];
      hourGroups[key].push(Number(t.netPnl ?? 0));
    }
    const byHour = Object.entries(hourGroups)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([name, pnls]) => ({ name, ...aggregateGroup(pnls) }));

    return { riskMetrics, byStrategy, bySymbol, byDayOfWeek, byHour };
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/getAdvancedAnalytics.ts
git commit -m "feat: add getAdvancedAnalytics server function"
```

### Task 15: Advanced analytics components

**Files:**
- Create: `src/components/dashboard/RiskMetrics.tsx`
- Create: `src/components/dashboard/PerformanceCharts.tsx`

- [ ] **Step 1: Create `src/components/dashboard/RiskMetrics.tsx`**

```typescript
interface RiskMetricsProps {
  sharpe: number;
  maxDrawdown: { dollars: number; percent: number };
  avgRR: number;
  avgHoldTimeHours: number;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

export function RiskMetrics({ sharpe, maxDrawdown, avgRR, avgHoldTimeHours }: RiskMetricsProps) {
  const hours = Math.round(avgHoldTimeHours);
  const holdStr = hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <MetricCard label="Sharpe Ratio" value={sharpe.toFixed(2)} sub="Annualized (252d)" />
      <MetricCard
        label="Max Drawdown"
        value={`-$${maxDrawdown.dollars.toFixed(0)}`}
        sub={`${maxDrawdown.percent.toFixed(1)}% peak-to-trough`}
      />
      <MetricCard label="Avg Risk/Reward" value={`${avgRR.toFixed(2)}x`} />
      <MetricCard label="Avg Hold Time" value={holdStr} />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/dashboard/PerformanceCharts.tsx`**

```typescript
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

type GroupStats = { name: string; avgPnl: number; totalPnl: number; winRate: number; count: number };

interface PerformanceChartsProps {
  byStrategy: GroupStats[];
  bySymbol: GroupStats[];
  byDayOfWeek: GroupStats[];
  byHour: GroupStats[];
}

const POSITIVE_COLOR = '#22c55e';
const NEGATIVE_COLOR = '#ef4444';
const NEUTRAL_COLOR = '#6366f1';

function PnLBar({ data, dataKey = 'avgPnl', name }: { data: GroupStats[]; dataKey?: keyof GroupStats; name: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-sm font-medium text-zinc-300 mb-4">{name}</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ left: -20, right: 10 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} />
          <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #27272a', color: '#fff' }}
            formatter={(val: number) => [`$${val.toFixed(2)}`, 'Avg P&L']}
          />
          <Bar dataKey={dataKey as string} radius={[3, 3, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={(entry[dataKey] as number) >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PerformanceCharts({ byStrategy, bySymbol, byDayOfWeek, byHour }: PerformanceChartsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <PnLBar data={byStrategy} name="Avg P&L by Strategy" />
      <PnLBar data={bySymbol} name="Avg P&L by Symbol (Top 10)" />
      <PnLBar data={byDayOfWeek} name="Avg P&L by Day of Week" />
      <PnLBar data={byHour} name="Avg P&L by Entry Hour" />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/RiskMetrics.tsx src/components/dashboard/PerformanceCharts.tsx
git commit -m "feat: add RiskMetrics and PerformanceCharts dashboard components"
```

### Task 16: Update dashboard route

**Files:**
- Modify: `src/routes/_authenticated/dashboard.tsx`

- [ ] **Step 1: Add advanced analytics to dashboard**

In `src/routes/_authenticated/dashboard.tsx`, add a second query for `getAdvancedAnalytics` and render the new components below the existing equity curve:

```typescript
import { getAdvancedAnalytics } from '@/server/getAdvancedAnalytics';
import { RiskMetrics } from '@/components/dashboard/RiskMetrics';
import { PerformanceCharts } from '@/components/dashboard/PerformanceCharts';

// Inside the component, add:
const { data: advanced } = useQuery({
  queryKey: ['advanced-analytics'],
  queryFn: () => getAdvancedAnalytics({ data: undefined }),
  staleTime: 5 * 60 * 1000,
});

// Below the existing equity curve JSX, add:
{advanced && (
  <div className="space-y-6">
    <h2 className="text-xl font-semibold text-white">Risk & Performance</h2>
    <RiskMetrics
      sharpe={(advanced as any).riskMetrics.sharpe}
      maxDrawdown={(advanced as any).riskMetrics.maxDrawdown}
      avgRR={(advanced as any).riskMetrics.avgRR}
      avgHoldTimeHours={(advanced as any).riskMetrics.avgHoldTimeHours}
    />
    <PerformanceCharts
      byStrategy={(advanced as any).byStrategy}
      bySymbol={(advanced as any).bySymbol}
      byDayOfWeek={(advanced as any).byDayOfWeek}
      byHour={(advanced as any).byHour}
    />
  </div>
)}
```

- [ ] **Step 2: Verify manually**

Navigate to `/dashboard`. Confirm risk metric cards appear below equity curve with Sharpe, Max Drawdown, R:R, Hold Time. Confirm four bar charts render with colored bars.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/dashboard.tsx
git commit -m "feat: add advanced analytics sections to dashboard"
```

---

## Final Checks

- [ ] Run `npm run lint` — fix any Biome errors
- [ ] Run `npm run test` — confirm analytics tests still pass
- [ ] Run `npm run build` — confirm no TypeScript or build errors
- [ ] Add GCP env vars as Cloudflare Worker secrets:
  ```bash
  wrangler secret put GCP_PROJECT_ID
  wrangler secret put GCP_BUCKET_NAME
  wrangler secret put GCP_SERVICE_ACCOUNT_KEY
  ```
- [ ] Final commit if any lint fixes were made
