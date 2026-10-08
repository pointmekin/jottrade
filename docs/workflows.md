# Workflows

These workflows apply to all contributors and all agents. They use only the repository commands. [quality-gate.md](quality-gate.md) describes the checks, and [development-database.md](development-database.md) describes the local databases.

## Bounded implementation

Inputs:

- One issue with acceptance criteria.
- The base branch, usually `origin/main`.

Scope:

- Change only the files that the acceptance criteria need.
- Do not refactor or format unrelated code.
- Write each open question in the pull request. Do not guess a product decision.

Steps:

1. Read `AGENTS.md` and the issue.
2. Find the feature in [feature-map.md](feature-map.md). Read its entry points and its verification column.
3. Reuse the existing types, `as const` objects, query keys and server functions.
4. Write or change a test in `src/test/` for each acceptance criterion that a unit test can show.
5. Make the change.
6. Update `docs/feature-map.md` when the change adds or changes a feature.
7. Run `npm run quality`.
8. Run `npm run verify` when the change touches a critical flow.
9. Open a pull request with `.github/pull_request_template.md`.

Verification:

- `npm run quality` exits 0.
- `npm run verify` passes for a critical-flow change.
- The pull request shows each command and its result.

Stop when:

- All acceptance criteria have evidence. Stop and do not add more features.
- The issue is not clear, or the change must touch code out of scope. Stop and ask the owner.

## Proportional debugging and verification

Inputs:

- A failure: a test, a gate finding, a CI log or a bug report with steps.

Scope:

- Make the investigation proportional to the risk. A local cause with a clear stack trace needs a fast fix. An intermittent failure or a critical-flow failure needs a reproduction first.
- Fix the cause. Do not suppress a rule, change a threshold or delete a test to pass.

Steps:

1. Reproduce the failure with the smallest command, for example `npx vitest run <file>`.
2. For a database or browser failure, use a disposable `jottrade_test_*` database. See [Several worktrees and verification runs](development-database.md#several-worktrees-and-verification-runs).
3. For an `npm run verify` failure, read the evidence. See [Evidence on failure](quality-gate.md#evidence-on-failure).
4. Write a test that fails for the cause, when a test can show it.
5. Fix the cause. Run the test again.
6. Run `npm run quality`, then `npm run verify` when the failure was in a critical flow.

Verification:

- The new or changed test fails before the fix and passes after it.
- The gate commands exit 0.

Stop when:

- The failure no longer occurs and the gate passes.
- You cannot reproduce the failure. Record the steps and the results in the issue, and stop.
- The same class of failure occurred before. Go to [Correction to guardrail](#correction-to-guardrail).

## Migration and rollout

Inputs:

- A schema change in `src/db/`.

Scope:

- Make only expand changes: add a table, a nullable column or a column with a default.
- The live code must work with the new schema. `.github/workflows/deploy.yml` migrates production before it deploys the new code.
- Migrations have no down step. A drop or a rename needs a separate, later pull request, after no live code uses the old name.
- Do not edit a migration that is on `main`.

Steps:

1. Change the schema in `src/db/`.
2. Run `npx drizzle-kit generate --name <name>`. Read the generated SQL.
3. Apply it to your worktree database with `npm run db:dev:migrate`.
4. Apply it from an empty database: `DATABASE_URL=postgresql://jottrade:jottrade@127.0.0.1:54329/jottrade_test_<name> npm run db:reset`.
5. Run `npm run quality` and `npm run verify`.
6. Remove the disposable database with `npm run db:drop` and the same `DATABASE_URL`.
7. In the pull request, write the rollout impact: the new objects, and why the live code still works.

When `main` adds a migration with the same index as your branch:

1. Take `main`'s `drizzle/meta`: `git checkout origin/main -- drizzle/meta`.
2. Delete the branch migration `drizzle/<index>_<tag>.sql`.
3. Run `npx drizzle-kit generate --name <name>`. It writes the next index.
4. On a new disposable `jottrade_test_*` database, apply `main`'s migrations first, then the branch migration. For example, run `npm run db:reset` on a checkout of `origin/main`, then `npm run db:dev:migrate` with the same `DATABASE_URL` on the branch.
5. Run `npm run quality`. `src/test/migration-journal.test.ts` checks the journal, the SQL files and the snapshot chain.

Verification:

- `npm run quality` exits 0, with the migration journal test.
- `npm run db:reset` applies all migrations to an empty `jottrade_test_*` database.
- `npm run verify` passes.

Stop when:

- The migration applies after `main`'s migrations and the gate passes.
- The change needs a destructive step. Split it into a later pull request and ask the owner.

Production migrations: see [Production migrations](development-database.md#production-migrations).

## Correction to guardrail

When a review or an integration finds a mistake that can occur again:

1. Record the failure class in one sentence.
2. Choose the strongest practical remedy, in this order:
   1. A data model or a module boundary that makes the mistake impossible.
   2. An automated check in `npm run quality` or `npm run verify`.
   3. A step in a workflow in this file.
   4. A sentence in `AGENTS.md` or in a doc.
3. Add the correction to the list below.

Do not write a record for a small, one-time correction.

Recorded corrections:

| Date | Failure class | Remedy |
| --- | --- | --- |
| 2026-10-08 | PRs #48 and #49 both added migration index `0008` to `drizzle/meta/_journal.json`. Only a manual integration found it. | Automated check: `src/test/migration-journal.test.ts` (`scripts/quality/migrations.ts`) fails when journal indexes are not unique and contiguous from 0, when a journal tag and a `drizzle/*.sql` file do not match, or when the snapshot `prevId` chain breaks. The renumber steps are in [Migration and rollout](#migration-and-rollout). |

## Maintenance

Owner: the repository owner (@pointmekin) owns the checks, the test fixtures and these docs.

Review cadence: at each release, or monthly when there is no release, read this file and the recorded corrections. Remove a step that no longer helps.

Trust indicators. Collect each from GitHub. There are no targets or scores.

- Repeated review corrections: the same correction in the review comments of two or more pull requests.

  ```sh
  gh pr list --state merged --limit 50 --json number,title,reviews
  ```

- Escaped regressions: `fix:` commits and reverts on `main` for a recent change.

  ```sh
  git log origin/main --oneline -i -E --grep '^(fix|revert)'
  ```

- Verification success rate: the share of successful runs of `quality.yml`. Each run has the `Quality`, `Build` and `E2E` jobs.

  ```sh
  gh run list --workflow quality.yml --limit 100 --json conclusion
  ```

Event-triggered agent automation is deferred. Do not start an agent from an issue, an alert or a schedule until these prerequisites are true:

- `npm run verify` passes reliably in CI.
- The `main` ruleset enforces the required checks.
- The trust indicators above have a baseline from at least one review cycle.

After that, the first step is one pilot that opens a draft pull request from one issue or alert. No automation deploys or merges.
