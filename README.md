# JotTrade

JotTrade is a private trading journal. You record or import trades, track funding and adjustments per trading account, review days and weeks, and read performance metrics.

- Product features, routes and verification: [docs/feature-map.md](docs/feature-map.md)
- Architecture and agent rules: [AGENTS.md](AGENTS.md)
- Metric definitions: [docs/metrics.md](docs/metrics.md)

## Requirements

- [Bun](https://bun.sh). The lockfile is `bun.lock`, and CI installs with Bun.
- Node.js 22 to run the `npm run` scripts. `bun run <script>` also works.

## Install

```bash
bun install --frozen-lockfile
```

## Database

The app needs `DATABASE_URL` in `.env`. The isolated database workflow is described in [docs/development-database.md](docs/development-database.md).

Do not point `DATABASE_URL` at production. If `DATABASE_URL` is empty, `npm run dev` lets the Neon Vite plugin (`neon-vite-plugin.ts`) create a temporary claimable Neon database.

Other server variables are optional for local work:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` for Google sign-in.
- `GCP_BUCKET_NAME`, `GCP_SERVICE_ACCOUNT_KEY` for trade screenshots.
- `GEMINI_API_KEY` for the command palette fallback.

## Run

```bash
npm run dev      # Vite dev server on http://localhost:3000
```

## Verify

```bash
npm run test       # Vitest. Database tests skip unless their variables are set.
npm run typecheck  # tsc --noEmit
npm run quality    # The required gate: tsc, Vitest, then Biome, SonarJS and React Doctor on changed files
```

Run `npm run quality` before every commit. See "Quality gate" in [AGENTS.md](AGENTS.md).

## Build

```bash
npm run build    # Production build into .output (Nitro)
npm run serve    # Preview the production build
```

## Deployment

The build uses Nitro, and `vercel.json` sets up Vercel (framework `tanstack-start`). Pull requests get a Vercel preview deployment. `npm run deploy` (Wrangler) and `wrangler.jsonc` remain from the Cloudflare starter, but the Vite config has no Cloudflare plugin, so do not use them without a check.
