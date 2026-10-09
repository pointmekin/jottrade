# Quality gate

`npm run quality` (`scripts/quality.sh`) is the gate that every change must pass before it goes into `main`. CI runs the same script on every pull request as the **Quality** check (`.github/workflows/quality.yml`).

## Runtime and install

CI and local setup use the same runtime and the same frozen install:

| Item | Pinned by | CI step |
| --- | --- | --- |
| Bun | `.bun-version` (exact) | `oven-sh/setup-bun` with `bun-version-file: .bun-version` |
| Node (Vite and the build run on Node) | `.nvmrc` (major version) | `actions/setup-node` with `node-version-file: .nvmrc` |
| Dependencies | `bun.lock` | `bun install --frozen-lockfile` |

For a fresh checkout:

```sh
# Install the Bun version in .bun-version and the Node version in .nvmrc first.
bun install --frozen-lockfile
npm run quality
```

The gate prints a warning when the local Bun or Node version is not the pinned version.

## What the gate checks

### Always, on the whole project

- `tsc --noEmit`: types across `src/`, `scripts/` and the config files.
- `vitest run`: all tests. The database integration tests skip unless their `*_TEST_DATABASE_URL` variables are set. The gate does not connect to a database.

### On the files changed since `BASE`

`main` still has older Biome and React Doctor findings, so these tools check only the files that a change touches. A file that you touch must be clean.

- Biome (`biome check`) on every changed file. `biome.json` decides which files Biome checks.
- SonarJS (ESLint) on changed JS and TS files. `eslint.config.js` decides scope.
- React Doctor on changed JS and TS files. `doctor.config.json` decides scope.
- `bash -n` on changed shell scripts.

`BASE` is `origin/main` locally. In CI it is the base commit of the pull request (or of the merge group).

The changed files are all of these, compared with the merge base of `BASE` and `HEAD`:

- committed, staged and unstaged changes (`git diff --name-status -z --no-renames <merge-base>`);
- untracked files that `.gitignore` does not exclude (`git ls-files --others --exclude-standard -z`).

The file lists go to the tools NUL-separated (`xargs -0`), so paths with spaces, quotes or non-ASCII characters stay intact. A rename counts as a deletion of the old path and an addition of the new path: the new path is linted, and the old path can still start a focused check. Deleted files are not linted; `tsc` and Vitest find code that used them.

`src/routeTree.gen.ts` is excluded from the file-scoped linters. TanStack Router generates it from `src/routes/` on every dev start and build, so a finding in it cannot be fixed by hand. `tsc` still checks it, and the build check below fails if the committed copy is out of date.

Shared UI primitives (`src/components/ui/`) are linted by Biome. The ESLint and React Doctor configs ignore that directory, so those tools skip the files.

### Focused checks for tooling, config, shared UI and route changes

Some changes can break the build or the tooling without a change to application source. `scripts/quality/plan.ts` maps these paths to focused checks. The gate prints each check that it selects, with the paths that caused it.

| Changed path | Focused checks |
| --- | --- |
| `package.json`, `bun.lock` | build, lockfile, SonarJS on the whole project |
| `.bun-version`, `.nvmrc` | build, lockfile |
| `biome.json` | Biome config validation |
| `eslint.config.js` | SonarJS on the whole project |
| `vite.config.ts`, `tsconfig.json`, `vercel.json`, `src/styles.css` | build |
| `src/components/ui/**` | build |
| `src/server/**`, `src/db/**` | build (runs import protection) |
| `src/routes/**` added, deleted or renamed; `src/routeTree.gen.ts` | build |
| `.github/workflows/**` | workflow validation |
| `scripts/quality.sh`, `scripts/quality/**` | all focused checks |

The checks are:

- **build**: `bun run build` (the production build). After the build, the gate fails if the build changed `src/routeTree.gen.ts`. The Neon Vite plugin does nothing in production mode, so the build does not create or connect to a database.
- **lockfile**: `bun install --frozen-lockfile --dry-run` fails if `bun.lock` does not match `package.json`.
- **SonarJS on the whole project**: `main` has no SonarJS findings, so a new rule or a plugin upgrade is checked on every file.
- **Biome config validation**: Biome loads `biome.json` and fails on an invalid config. Biome does not run on the whole project, because `main` still has older Biome findings.
- **workflow validation**: `scripts/quality/check-workflows.ts` parses every workflow and checks that `quality.yml` keeps the merge contract: it runs on `pull_request` with no `paths` or `paths-ignore` filter, and each job in `REQUIRED_JOBS` (`Quality`, `Build`, `E2E`) has its name, has no `if` condition, installs with `bun install --frozen-lockfile` and runs its command.

A change to `doctor.config.json` gets no extra check: React Doctor still has older findings on `main`, so it cannot run on the whole project yet.

The tests for the selection are in `src/test/quality-changes.test.ts` (temporary git repositories) and `src/test/quality-workflow.test.ts`.

### Policy

Fix the cause of a finding. Do not suppress a rule or change a threshold to pass the gate. If a finding is a false positive, suppress it on that line with a reason, and say so in the pull request.

## Critical-flow verification

`npm run quality` stays fast and does not start the app. `npm run verify` (`scripts/verify/run.ts`) checks the critical flows against a production build and a real database. CI runs the same command as the **E2E** check.

### Run it

```sh
bun install --frozen-lockfile
npx playwright install chromium   # once per machine
npm run verify
```

The command needs PostgreSQL on `127.0.0.1:54329`. `scripts/db` starts the local server if it is not running ([development-database.md](development-database.md)). The command does not need `npm run db:setup`, a `.env` file or a running dev server.

- `npm run verify -- --no-build` reuses the existing `.output/` build.
- Other arguments go to `playwright test`. Example: `npm run verify -- --no-build e2e/trades.spec.ts`.

### What it does

1. It creates a new database `jottrade_test_verify_<random>`, then migrates and seeds it (`scripts/db/cli.ts reset`). The seed data is synthetic.
2. It builds the app (`vite build`, Nitro `node-server` output).
3. It checks the client bundle (see "Client bundle check").
4. It runs the database tests:
   - `src/test/user-isolation.integration.test.ts`: as Bob, the real server handlers cannot read, create, edit, move or delete Alice's trades, accounts, cash flows or strategies, and Alice's rows stay the same. Without a session, reads and writes fail. Account provisioning is checked under concurrent calls.
   - `src/test/sign-up-provisioning.integration.test.ts`: a sign-up through the real Better Auth instance creates one default account.
5. It starts the production server on port 3101, or on a free port if 3101 is in use, and runs the Playwright suite in `e2e/`.
6. It always drops the database at the end, also after a failure or `Ctrl+C`.

The run uses a new random `BETTER_AUTH_SECRET` and blank Google, GCP and Gemini variables. It never reads production credentials.

### The browser suite

| Spec | Flow | Seed user |
| --- | --- | --- |
| `auth.spec.ts` | Redirect to sign-in; sign in and reload; wrong password; another user's trade URL | Alice, Bob |
| `accounts.spec.ts` | Switch the account; the journal follows; the choice survives a reload | Alice |
| `server-auth.spec.ts` | A captured server-function read and write fail with no session and with another user's session | Alice, Bob |
| `trades.spec.ts` | Log, edit and delete a trade; each change survives a reload | Erin |
| `import.spec.ts` | Import a synthetic Exness CSV, then import it again: no duplicates | Erin |
| `totals.spec.ts` | Dashboard, calendar and strategy totals agree for Bob Main | Bob |
| `baseline.spec.ts` | Startup and navigation timings (a record, not a test) | Alice |

Rules for the suite:

- A spec reads only seed data that no spec writes, or rows that it writes itself. Two specs write to Erin with different symbols. The specs run in parallel and in any order. Each run starts from a new database, so no data stays from an earlier run.
- Use role and label selectors. Use a CSS selector only when no role exists (the hidden file input of the import dialog).
- The context uses the `UTC` time zone and the `en-US` locale, so dates and money text are stable.
- Each test sends its own `x-forwarded-for` address. Better Auth limits sign-in per client address in production, and parallel tests must not share one limit.
- Keep the suite small. Add a spec for a critical flow, not for each component.

### Evidence on failure

- `playwright-report/`: the HTML report. Open it with `npx playwright show-report`.
- `test-results/`: a trace, a screenshot and the page structure (`error-context.md`) for each failed test. Open a trace with `npx playwright show-trace <file>`.
- The console output contains the server log lines (`[WebServer]`).

In CI the **E2E** job uploads both folders as the `playwright-evidence` artifact when it fails. The data in them is synthetic, and the auth secret is random for each run.

### Client bundle check

`scripts/verify/check-client-bundle.ts <client dir> <server dir>` fails when a client file:

- names a server-only variable (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `GCP_SERVICE_ACCOUNT_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`);
- contains the value of one of these variables, as set in the environment of the check;
- contains a marker string from a server-only module (`pg`, `@neondatabase/serverless`, the Better Auth server adapter, the Google Cloud Storage client);
- contains a PostgreSQL connection string with credentials.

The check also fails when the server output does not contain a marker, so each marker proves something. The **Build** check builds with the Vercel preset and fake secret values, then runs the check on `.vercel/output/static`. `npm run verify` runs it on `.output/public` with the run's own database URL and secret.

### Performance baseline

`e2e/baseline.spec.ts` records these timings. It runs after the other specs finish, and prints a `Baseline:` line.

| Measure | Meaning |
| --- | --- |
| `signInTtfbMs`, `signInDomContentLoadedMs` | Navigation timing of the first `/sign-in` load (first request to a new server) |
| `signInReadyMs` | From `goto` until the sign-in heading shows |
| `dashboardReadyMs` | From `goto("/dashboard")` until "Across N trades" shows (Alice, Main USD) |
| `journalReadyMs` | From `goto("/journal")` until the first AAPL row shows |

Conditions: production build, Nitro `node-server`, local PostgreSQL, seeded data, Chromium, one page with no other test running.

| Date | Machine | sign-in TTFB | sign-in ready | dashboard ready | journal ready |
| --- | --- | --- | --- | --- | --- |
| 2026-10-08 | Local, macOS, Apple Silicon (3 runs) | 3–5 ms | 199–276 ms | 158–165 ms | 161–168 ms |
| 2026-10-07 | GitHub Actions `ubuntu-latest`, E2E job (1 run) | 7 ms | 309 ms | 289 ms | 349 ms |

These numbers are a record. They are not budgets. Set a budget only after several CI runs show the normal spread.

## Server boundaries

Three layers stop the most common server mistakes. Each layer fails with a message that names the file, the line and the fix.

| Check | Runs in | Fails when |
| --- | --- | --- |
| `src/test/server-boundaries.test.ts` (`scripts/quality/server-boundaries.ts`) | `npm run quality` (Vitest), before any build | A `createServerFn` has no `.middleware([authMiddleware])`; a POST has no `.validator()`; a `src/server/` file exports a helper or re-exports a value; a server function imports `requireUserId`; client code (components, hooks, routes, `src/lib/`) directly imports `src/db/`, `src/lib/auth.ts`, `src/lib/gcp.ts` or a driver package |
| TanStack Start import protection (`vite.config.ts`) | `bun run build`: the **Build** check, and the focused build check when `src/server/` or `src/db/` changes | Any module in the client graph, also through other files, imports a module in `scripts/quality/server-only.ts` |
| Client bundle check (`scripts/verify/check-client-bundle.ts`) | **Build** and `npm run verify` | The built client files contain a server-only marker, variable name or secret value |

`import type` from a server-only module is allowed, because TypeScript removes it. A client import of a server function from `src/server/` is allowed, because TanStack Start replaces the handler with an RPC call.

Narrow exceptions, each with a reason, are in `scripts/quality/server-boundaries.ts`:

- `SERVER_MODULE_EXPORTS`: none.
- `PUBLIC_SERVER_FUNCTIONS`: none. Every server function needs a session.
- `NO_INPUT_POSTS`: `exportArchive` and `ensureDefaultAccount` take no input.

### Authenticated server functions

```ts
export const getRows = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(scopeSchema)
	.handler(async ({ data, context }) => readRows(context.userId, data));
```

`authMiddleware` (`src/server/auth-middleware.ts`) runs first. A request without a session fails with "Unauthorized" before the validator and the handler. A handler still checks ownership of each record it reads or writes (`requireOwnedPortfolio` and `userId` conditions).

Tests that call server functions use `src/test/server-fn-mock.ts`. It runs the middleware, the validator and the handler in the same order as the server.

Negative tests:

- `src/test/user-isolation.integration.test.ts` (in `npm run verify`): no session, and another user's session, for reads and writes, on PostgreSQL.
- `e2e/server-auth.spec.ts`: a real server-function read and write, captured in the browser and sent again over HTTP with no session and with another user's session.

### Sign-in rate limit and client address

Better Auth limits sign-in per client address, from `x-forwarded-for` (`src/lib/auth.ts`). Vercel overwrites `x-forwarded-for` with the real client address, so a client cannot choose its rate-limit key in production. A different host must also overwrite the header. The E2E suite sends its own address for each test (`e2e/support.ts`), because it talks to the server with no proxy.

## Branch protection

The repository ruleset `main` protects the default branch. It is active. A failing or pending **Quality** check blocks the merge.

### Rules

| Rule | Setting | Reason |
| --- | --- | --- |
| Pull request required | 0 approvals | One owner and the agents work alone. GitHub does not let an author approve their own pull request. Raise the number when a second maintainer joins. |
| Status check | `Quality` from GitHub Actions (app id `15368`), branch up to date | The gate checks the change relative to the base, so it must run on the latest `main`. |
| Linear history | on | Squash merge stays allowed. Merge commits are blocked. |
| Block force pushes (`non_fast_forward`) | on | Protects the history that Vercel deploys. |
| Restrict deletions (`deletion`) | on | Protects `main`. |

Each merge to `main` deploys production (`.github/workflows/deploy.yml`). The ruleset keeps unchecked code out of that path.

### Bypass policy

- Only the **Repository admin** role can bypass, and only **For pull requests**. An emergency fix still needs a pull request. A direct push to `main` stays blocked.
- Do not add GitHub Apps, bots or other roles to the bypass list.
- Do not use the bypass to merge a pull request with a failing **Quality** check, unless the owner accepts the risk for that pull request.

### Add a required check

`quality.yml` defines the checks **Quality**, **Build** and **E2E**. `REQUIRED_JOBS` in `scripts/quality/workflow.ts` lists them. For a new check, use a stable job name, add it to `REQUIRED_JOBS`, and add the name to `required_status_checks` in the ruleset after the check passes on a pull request. Do not use a `paths` filter on a required workflow: the workflow does not run, and the check stays pending and blocks the merge. Do not use an `if` condition on a required job: GitHub counts a skipped job as a pass, so the merge goes through without the gate. `scripts/quality/check-workflows.ts` enforces this for each job in `REQUIRED_JOBS`.

### Recreate the ruleset

Run this command with an admin token. Use `PUT repos/pointmekin/jottrade/rulesets/<id>` to change an existing ruleset. The role id `5` is the repository admin role.

```sh
gh api -X POST repos/pointmekin/jottrade/rulesets --input - <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }
  ],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [{ "context": "Quality", "integration_id": 15368 }]
      }
    }
  ]
}
JSON
```

### Verify the effective rules

```sh
gh api repos/pointmekin/jottrade/rules/branches/main
```

The output must contain `pull_request`, `required_status_checks` with the context `Quality`, `required_linear_history`, `non_fast_forward` and `deletion`. On a pull request, the merge box must show **Quality** as a required check. Do not merge a deliberately failing pull request to test the rule.
