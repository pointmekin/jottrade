# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Commands

Install with `bun install --frozen-lockfile` (the lockfile is `bun.lock`; CI uses Bun). `.bun-version` and `.nvmrc` pin the Bun and Node versions. Run `npm run db:setup` before `npm run dev`.

- `npm run dev` starts Vite on port 3000.
- `npm run build` creates a production build.
- `npm run serve` previews the production build.
- `npm run test` runs the Vitest suite.
- `npm run lint`, `npm run format`, and `npm run check` use Biome.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run lint:sonar` runs the SonarJS rules (the SonarLint analyzer) through ESLint.
- `npm run doctor` runs React Doctor on the whole project.
- `npm run quality` runs the quality gate. See "Quality gate".
- `npm run verify` runs the critical-flow checks: a disposable seeded database, the production build, a client bundle check, database isolation tests and the Playwright suite in `e2e/`. Run `npx playwright install chromium` once first.
- `npm run db:setup`, `db:server`, `db:dev:migrate`, `db:seed`, `db:reset`, `db:drop`, `db:check`, and `db:list` manage the isolated local database. They refuse unsafe targets. See [docs/development-database.md](docs/development-database.md).
- `npm run db:generate`, `npm run db:migrate`, `npm run db:push`, `npm run db:pull`, and `npm run db:studio` call `drizzle-kit` directly, with no safety guard. Use them only against an isolated database.
- Production deploys run in GitHub Actions, not from a local command. See "Deployment".

## Architecture

This is a TanStack Start full-stack application built on Vite 7. It uses:

- TanStack Router v1 for file-based, type-safe routing.
- TanStack React Query v5 for client data fetching and server-state management.
- Better Auth v1 with email/password and Google OAuth.
- PostgreSQL through Neon serverless and Drizzle ORM.
- React 19, Tailwind CSS v4, shadcn/ui in the new-york style, and Recharts.
- Zod and React Hook Form for validation and forms.
- Biome for linting and formatting.
- Nitro for the server build, deployed on Vercel.

### Deployment

Vercel is the only deploy target. `vite.config.ts` builds the server with Nitro. `.github/workflows/deploy.yml` runs on each push to `main`: `vercel build`, then `drizzle-kit migrate` on the production database, then `vercel deploy --prebuilt --prod`. A failed build does not migrate, and a failed migration does not deploy. `vercel.json` turns off Vercel's Git auto-deploy for `main`; pull requests still get preview deployments. Migrations have no down step, so a new migration must work with the code that is live before it. Owner setup: [docs/owner-todo.md](docs/owner-todo.md).

### Routing

Routes live in `src/routes/`. Underscore-prefixed directories are route groups; `_authenticated/route.tsx` applies the authentication guard. `src/routeTree.gen.ts` is generated and must not be edited manually.

- `__root.tsx` defines the root layout, sidebar, theme provider, and development tools.
- `_authenticated/` contains protected dashboard, journal, trade detail (`journal_.$tradeId.tsx`), calendar, strategies, reviews, and settings routes.
- `_unauthenticated/` contains sign-in and sign-up routes.
- `api/` contains API route handlers, including Better Auth endpoints.
- `index.tsx` is the public landing page. `profile.tsx` checks the session in the page.

The guard runs on the client: unauthenticated visitors to protected routes are redirected to `/sign-in`.

### Server functions

Backend operations live in `src/server/` as TanStack Start `createServerFn` functions. Client components call them through TanStack Query. Keep database schema and relations in `src/db/` (`schema.ts` re-exports `trading-schema.ts` and `review-schema.ts`). Import the client as `@/db` (`src/db/index.ts`). `DATABASE_DRIVER` selects the transport: empty or `neon` uses Neon HTTP (production); `pg` uses node-postgres through `src/db/pg-transport.ts` for local PostgreSQL.

Key server modules include:

- `getTrades.ts` for trade queries.
- `getAnalytics.ts` and `getAdvancedAnalytics.ts` for trading analytics.
- `tradeActions.ts` for trade mutations.
- `importActions.ts` for trade and adjustment imports, import history, and batch undo.
- `tradeRiskActions.ts` for original-risk corrections.
- `reviewActions.ts`, `reviewPreferenceActions.ts`, `reviewQueueActions.ts`, and `tradeReviewActions.ts` for daily and weekly reviews.
- `calendarActions.ts`, `imageActions.ts`, and `commandIntentActions.ts` for the calendar, trade screenshots, and the command palette fallback.
- `strategyActions.ts` for strategy queries and mutations.
- `portfolioActions.ts` for trading accounts, and `cashFlowActions.ts` for deposits, withdrawals and adjustments.

Every server function starts with `createServerFn(...).middleware([authMiddleware])` (`src/server/auth-middleware.ts`) and reads the user from `context.userId`. A POST validates its input with `.validator()`. A test in `src/test/server-boundaries.test.ts` enforces these rules; see "Server boundaries" in [docs/quality-gate.md](docs/quality-gate.md). Pure logic (metrics, CSV parsing, search params) lives in `src/lib/` with tests in `src/test/`.

### Database

The core tables are:

- `user`, `session`, `account`, and `verification`, managed by Better Auth.
- `portfolios`, which represent multiple trading accounts per user.
- `trades`, which store entries, exits, P&L, original risk, notes, psychology fields, screenshots, and import identity.
- `cash_flows`, which store deposits, withdrawals, and adjustments.
- `strategies`, which represent trading setups and patterns.
- `import_batches` and `import_identities`, which record reconciled import batches.
- `review_periods`, `review_source_trades`, and `review_source_cash_flows`, which store reviews and their frozen sources.

Migrations live in `drizzle/`.

### Feature map

[docs/feature-map.md](docs/feature-map.md) lists routes, entry points, user flows, data ownership, and how each feature is verified. A feature change must update `docs/feature-map.md` in the same pull request.

### Authentication

Better Auth is configured in `src/lib/auth.ts` for the server and `src/lib/auth-client.ts` for the client. Access client session state through `authClient.useSession()`. Auth API routes are mounted under `/api/auth/*`.

### Components

Shared shadcn/ui primitives live in `src/components/ui/`. Product components are grouped by feature under `src/components/`. Add shadcn components with `pnpx shadcn@latest add <component>` and preserve the existing new-york style.

- `src/components/dashboard/` contains analytics charts and statistics.
- `src/components/journal/` contains the trade table, filters, import flow, detail sheet, and entry form.
- `src/components/calendar/` contains the trading calendar.
- `src/components/strategies/` contains strategy management.
- `src/components/reviews/` contains daily and weekly reviews.
- `src/components/account/` contains the account switcher and account dialogs.
- `src/components/command-palette/` contains the `Cmd/Ctrl+K` command palette.
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

Run `npm run quality` before every commit and before you report a task as done. The task is not done until it passes. [docs/quality-gate.md](docs/quality-gate.md) describes what it checks.

- `tsc --noEmit` and Vitest check the whole project.
- Biome, SonarJS and React Doctor check the files changed since `BASE` (default `origin/main`). `main` still has older findings, so a file you touch must be clean when you finish.
- CI runs the same gate on every pull request (`.github/workflows/quality.yml`), with `BASE` set to the pull request base.
- CI also runs the **Build** check (Vercel-preset build and client bundle check) and the **E2E** check (`npm run verify`). Run `npm run verify` before you report a change to a critical flow as done: sign-in, account switching, trade create/edit/delete, import, or dashboard, calendar and strategy totals. See "Critical-flow verification" in [docs/quality-gate.md](docs/quality-gate.md).
- The `main` ruleset requires a pull request and the `Quality` check. See "Branch protection" in [docs/quality-gate.md](docs/quality-gate.md).

Fix the cause of a finding. Do not suppress a rule or change a threshold to pass the gate. If a finding is a false positive, suppress it on that line with a reason, and say so in the pull request.

## Code style

- Reuse the domain `as const` objects in `src/lib/trade.ts`, `src/lib/account.ts` and `src/lib/account-entry.ts`. Do not write `"LONG"`, `"CLOSED"` or other domain strings inline.
- Put a query key in `QueryKey` (`src/lib/query-keys.ts`) before you use it.
- Default to no comment. Write one only for a reason the code cannot show: a business rule, an external constraint, or a workaround.
- Keep a component to one job. Biome fails a function above 120 lines, and SonarJS fails a file above 400 lines (500 for tests).
- A component reads shared state (account, currency) from its hook, not from props passed down.
- `src/server/` files export only `createServerFn` or `createMiddleware` results and types. Put a helper they share in a server-only module: `src/lib/auth.ts` for the session, `src/db/` for queries. `src/server/rangeInput.ts` (a shared Zod schema) is an existing exception.
- Client code (components, hooks, routes, `src/lib/`) never imports `src/db/`, `src/lib/auth.ts`, `src/lib/gcp.ts` or a database driver. Call a server function instead. `import type` is allowed. `scripts/quality/server-only.ts` lists these modules; the build fails on a violation.

## Environment variables

`.env.example` lists the variables. `npm run db:setup` fills the database and auth values for local work ([docs/development-database.md](docs/development-database.md)); never point a local checkout at production.

- `DATABASE_URL`: required. Server-only; never use a `VITE_` prefix.
- `DATABASE_DRIVER`: optional. `neon` (default) or `pg`.
- `BETTER_AUTH_SECRET`: required in production. `BETTER_AUTH_URL`: optional.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: optional, Google sign-in.
- `GCP_BUCKET_NAME`, `GCP_SERVICE_ACCOUNT_KEY`: trade screenshots.
- `GEMINI_API_KEY`: optional command palette fallback.
- `DATABASE_URL_POOLER`: not read today.

In a deployment, set them in the Vercel project environment, not in source control.
