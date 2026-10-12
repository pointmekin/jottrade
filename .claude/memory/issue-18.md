# Issue #18 (strategies as playbooks)

- Plan: /Users/dhanabordeemekintharanggur/.paseo/plans/issue-18-plan.md. Order A → B → C → D; no slice E (owner decision).
- Slice A merged as #62. Slice B is PR #65 (open, not merged).
- Slice B decisions:
  - `src/db/strategies.ts`: `requireOwnedStrategy` (owned and not archived), `activeStrategySql`, `assertActiveStrategySql`.
  - `lockPortfolio` in `src/db/portfolios.ts`. Trade writes lock the account row first, as `deleteStrategy` does.
  - `createTrade` guard: an INSERT has no WHERE. A `1/count(*)` statement in the batch rolls it back; the catch runs the check again for a clear message.
  - `updateTrade` checks the strategy only when `setupId` changes. Guard is in the UPDATE WHERE.
  - `strategyLabel` in `src/lib/playbook.ts` gives "Name (archived)".
- Test layout:
  - Strategy DB tests are in `strategy-isolation.integration.test.ts`. `user-isolation` hit the 500-line SonarJS limit.
  - `npm run verify` runs DB test files with `--no-file-parallelism` (shared seed, snapshot compares).
  - Unit tests that mock `@/db` need `batch` and `execute`.
- Slice C carry-forward: make criterion ids unique before `playbook_check` uses them as keys.
- Env: Node 22 at `$HOME/.nvm/versions/node/v22.19.0/bin`; run `bun install --frozen-lockfile` in a new worktree.
