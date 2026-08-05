# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server on port 3000 (Vite)
npm run build        # Production build
npm run serve        # Preview production build

# Code Quality
npm run lint         # Lint with Biome
npm run format       # Format with Biome
npm run check        # Check with Biome (lint + format)

# Testing
npm run test         # Run tests with Vitest

# Database
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run migrations
npm run db:push      # Push schema to database (dev)
npm run db:studio    # Open Drizzle Studio GUI

# Deployment
npm run deploy       # Deploy to Cloudflare Workers via Wrangler
```

## Tech Stack

- **Framework:** TanStack Start (full-stack, built on Vite 7)
- **Routing:** TanStack Router v1 (file-based, type-safe)
- **Data fetching:** TanStack React Query v5
- **Auth:** BetterAuth v1 (email/password + Google OAuth)
- **Database:** PostgreSQL via Neon (serverless), Drizzle ORM
- **UI:** React 19, Tailwind CSS v4, shadcn/ui (new-york style), Recharts
- **Validation:** Zod + React Hook Form
- **Linting/Formatting:** Biome (not ESLint/Prettier)
- **Deployment:** Cloudflare Workers

## Architecture

### Routing Structure

File-based routing under `src/routes/`:
- `__root.tsx` — root layout (sidebar, theme provider, devtools)
- `_authenticated/` — protected routes (dashboard, journal, settings, tools)
- `_unauthenticated/` — auth pages (sign-in, sign-up)
- `api/` — API route handlers (auth endpoints)
- `routeTree.gen.ts` — auto-generated, never edit manually

Route groups use underscore prefix. Authentication guards are applied at the layout level — unauthenticated users are redirected to `/sign-in`.

### Server Functions

Backend logic lives in `src/server/` as TanStack Start server functions (`createServerFn`). These are type-safe and callable directly from client components via React Query:

```ts
// Define in src/server/
export const getTrades = createServerFn().handler(async () => { ... })

// Use in components
useQuery({ queryKey: ["trades"], queryFn: () => getTrades() })
```

Key server files: `getTrades.ts`, `getAnalytics.ts`, `tradeActions.ts`, `importActions.ts`.

### Database Layer

Schema defined in `src/db/schema.ts` using Drizzle ORM. Core tables:
- `user`, `session`, `account`, `verification` — BetterAuth managed
- `portfolios` — multiple trading accounts per user
- `trades` — core trade data (entry/exit prices, P&L, notes, tags)
- `strategies` — trading patterns/setups

Database client initialized in `src/db/index.ts` using Neon serverless PostgreSQL.

### Authentication

BetterAuth configured in `src/lib/auth.ts` (server) and `src/lib/auth-client.ts` (client). Session state accessed via `authClient.useSession()` hook. Auth API routes mounted at `/api/auth/*`.

### UI Components

- `src/components/ui/` — shadcn/ui primitives (add with `pnpx shadcn@latest add <component>`)
- `src/components/dashboard/` — analytics charts and stat cards
- `src/components/journal/` — trade journal table and forms
- `src/components/tools/` — trading tools (position size calculator, etc.)
- `src/components/app-sidebar.tsx` — main navigation

### Path Alias

`@/*` maps to `./src/*` throughout the codebase.

## Environment Variables

Required in `.env`:
```
VITE_DATABASE_URL=          # Direct Neon connection URL
VITE_DATABASE_URL_POOLER=   # Pooled connection URL (for production)
```

Google OAuth also requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the Cloudflare Workers environment.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `pointmekin/jottrade`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
