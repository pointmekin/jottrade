# Issue #18 playbooks: slice A state

- PR #62 (branch `issue-18-a-playbooks`) is open, not merged. Review fixes pushed at `0f5699d`. Plan: `~/.paseo/plans/issue-18-plan.md`.
- Migration `drizzle/0012_playbooks.sql`: strategies `criteria`, `risk_guidance`, `criteria_version`, `archived_at` (timestamptz); trades `playbook_check` (nullable, slice C writes it).
- Version rule: one SQL `CASE` in `updateStrategy` (`jsonb IS DISTINCT FROM`), not a lib function. Tested in `user-isolation.integration.test.ts`.
- `deleteStrategy` returns `{ deleted: false, usedBy: n }` for a used strategy (no throw); the client writes the text and offers Archive only for an active strategy.
- Slice B must filter archived strategies in the trade form, the bulk edit bar and the journal filter.

## Repo facts learned

- A `jsonb` column typed `unknown` breaks TanStack server-function return types (`{}`). Use the recursive `JsonObject` type in `trading-schema.ts`.
- SonarJS `max-lines` counts code lines; `user-isolation.integration.test.ts` is near the 500 limit. Put new DB tests for slices B-D in a new file, and add that file to `scripts/verify/run.ts`.
- A test of mutation state across selections needs one stable `QueryClient` (the old `Wrapper` makes a new one on each render).
- Radix `Checkbox` in jsdom needs a `ResizeObserver` stub (see `password-forms.test.tsx`).
- To check an upgrade path, use a temporary `git worktree` of `origin/main` with a `node_modules` symlink: run `db:reset` there, then `db:dev:migrate` on the branch.
- `npm run verify -- --no-build <spec>` runs one Playwright spec. Use it for screenshots.
