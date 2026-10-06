# JotTrade

JotTrade is a private trading journal. You record or import trades, track funding and adjustments per trading account, review days and weeks, and read performance metrics.

- Product features, routes and verification: [docs/feature-map.md](docs/feature-map.md)
- Architecture and agent rules: [AGENTS.md](AGENTS.md)
- Metric definitions: [docs/metrics.md](docs/metrics.md)

## Requirements

- [Bun](https://bun.sh), at the version in `.bun-version`. The lockfile is `bun.lock`, and CI installs with Bun.
- Node.js, at the major version in `.nvmrc`. Vite and the build run on Node.

## Install

```bash
bun install --frozen-lockfile
```

## Database

Run `npm run db:setup` first:

```bash
npm run db:setup   # local PostgreSQL, this worktree's database, migrations, seed data, .env values
```

The isolated database workflow, the seeded users and the other `db:*` commands are described in [docs/development-database.md](docs/development-database.md). Do not point `DATABASE_URL` at production. "Environment variables" in [AGENTS.md](AGENTS.md) lists every server variable.

## Run

```bash
npm run dev      # Vite dev server on http://localhost:3000
```

## Verify

```bash
npm run test       # Vitest. Database tests skip unless their variables are set.
npm run typecheck  # tsc --noEmit
npm run quality    # The required gate
```

Run `npm run quality` before every commit. [docs/quality-gate.md](docs/quality-gate.md) describes what it checks.

## Build

```bash
npm run build    # Production build into .output (Nitro)
npm run serve    # Preview the production build
```

## Deployment

Vercel is the only deploy target. Production deploys run in GitHub Actions (`.github/workflows/deploy.yml`) on each push to `main`: build, then run the Drizzle migrations on the production database, then deploy the prebuilt output. Vercel does not auto-deploy `main`. Pull requests still get Vercel preview deployments. Setup and rollback steps: [docs/owner-todo.md](docs/owner-todo.md).
