# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Commands

- `npm run dev` starts Vite on port 3000.
- `npm run build` creates a production build.
- `npm run serve` previews the production build.
- `npm run test` runs the Vitest suite.
- `npm run lint`, `npm run format`, and `npm run check` use Biome.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run lint:sonar` runs the SonarJS rules (the SonarLint analyzer) through ESLint.
- `npm run doctor` runs React Doctor on the whole project.
- `npm run quality` runs the quality gate. See "Quality gate".
- `npm run db:generate`, `npm run db:migrate`, `npm run db:push`, and `npm run db:studio` manage Drizzle.
- `npm run deploy` deploys to Cloudflare Workers with Wrangler.

## Architecture

This is a TanStack Start full-stack application built on Vite 7. It uses:

- TanStack Router v1 for file-based, type-safe routing.
- TanStack React Query v5 for client data fetching and server-state management.
- Better Auth v1 with email/password and Google OAuth.
- PostgreSQL through Neon serverless and Drizzle ORM.
- React 19, Tailwind CSS v4, shadcn/ui in the new-york style, and Recharts.
- Zod and React Hook Form for validation and forms.
- Biome for linting and formatting.
- Cloudflare Workers for deployment.

### Routing

Routes live in `src/routes/`. Underscore-prefixed directories are route groups; `_authenticated/route.tsx` applies the authentication guard. `src/routeTree.gen.ts` is generated and must not be edited manually.

- `__root.tsx` defines the root layout, sidebar, theme provider, and development tools.
- `_authenticated/` contains protected dashboard, journal, calendar, strategies, and settings routes.
- `_unauthenticated/` contains sign-in and sign-up routes.
- `api/` contains API route handlers, including Better Auth endpoints.

Unauthenticated visitors to protected routes are redirected to `/sign-in`.

### Server functions

Backend operations live in `src/server/` as TanStack Start `createServerFn` functions. Client components call them through TanStack Query. Keep database schema and relations in `src/db/schema.ts`; use the client from `src/db/index.ts`.

Key server modules include:

- `getTrades.ts` for trade queries.
- `getAnalytics.ts` and `getAdvancedAnalytics.ts` for trading analytics.
- `tradeActions.ts` for trade mutations.
- `importActions.ts` for trade imports.
- `strategyActions.ts` for strategy queries and mutations.

### Database

The core tables in `src/db/schema.ts` are:

- `user`, `session`, `account`, and `verification`, managed by Better Auth.
- `portfolios`, which represent multiple trading accounts per user.
- `trades`, which store entries, exits, P&L, notes, psychology fields, screenshots, and import hashes.
- `strategies`, which represent trading setups and patterns.

### Authentication

Better Auth is configured in `src/lib/auth.ts` for the server and `src/lib/auth-client.ts` for the client. Access client session state through `authClient.useSession()`. Auth API routes are mounted under `/api/auth/*`.

### Components

Shared shadcn/ui primitives live in `src/components/ui/`. Product components are grouped by feature under `src/components/`. Add shadcn components with `pnpx shadcn@latest add <component>` and preserve the existing new-york style.

- `src/components/dashboard/` contains analytics charts and statistics.
- `src/components/journal/` contains the trade table, filters, import flow, detail sheet, and entry form.
- `src/components/calendar/` contains the trading calendar.
- `src/components/strategies/` contains strategy management.
- `src/components/tools/` contains trading calculators and tools.
- `src/components/app-sidebar.tsx` and `src/components/bottom-nav.tsx` provide primary navigation.

Use the `@/*` alias for imports from `src/`.

## Repository conventions

- Use Biome for linting and formatting. ESLint runs only the SonarJS rules in `eslint.config.js`; do not add other ESLint rules or Prettier.
- Reuse the existing Better Auth session flow and keep auth API routes under `/api/auth/*`.
- Apply authentication at the route-layout level for protected screens.
- Preserve strong TypeScript types across server functions, query results, forms, and database operations.
- Keep secrets out of source control.

## Quality gate

Run `npm run quality` before every commit and before you report a task as done. The task is not done until it passes.

- `tsc --noEmit` and Vitest check the whole project.
- Biome, SonarJS and React Doctor check the files changed since `BASE` (default `origin/main`). `main` still has older findings, so a file you touch must be clean when you finish.
- CI runs the same gate on every pull request (`.github/workflows/quality.yml`), with `BASE` set to the pull request base.

Fix the cause of a finding. Do not suppress a rule or change a threshold to pass the gate. If a finding is a false positive, suppress it on that line with a reason, and say so in the pull request.

## Code style

- Reuse the domain `as const` objects in `src/lib/trade.ts`, `src/lib/account.ts` and `src/lib/account-entry.ts`. Do not write `"LONG"`, `"CLOSED"` or other domain strings inline.
- Put a query key in `QueryKey` (`src/lib/query-keys.ts`) before you use it.
- Default to no comment. Write one only for a reason the code cannot show: a business rule, an external constraint, or a workaround.
- Keep a component to one job. Biome fails a function above 120 lines, and SonarJS fails a file above 400 lines (500 for tests).
- A component reads shared state (account, currency) from its hook, not from props passed down.
- `src/server/` files export only `createServerFn` results. Put a helper they share in a server-only module: `src/lib/auth.ts` for the session, `src/db/` for queries.

## Environment variables

Local database access requires these variables in `.env`:

```dotenv
DATABASE_URL=
DATABASE_URL_POOLER=
```

Google OAuth also requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the Cloudflare Workers environment.
