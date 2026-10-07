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
| `src/routes/**` added, deleted or renamed; `src/routeTree.gen.ts` | build |
| `.github/workflows/**` | workflow validation |
| `scripts/quality.sh`, `scripts/quality/**` | all focused checks |

The checks are:

- **build**: `bun run build` (the production build). After the build, the gate fails if the build changed `src/routeTree.gen.ts`. The Neon Vite plugin does nothing in production mode, so the build does not create or connect to a database.
- **lockfile**: `bun install --frozen-lockfile --dry-run` fails if `bun.lock` does not match `package.json`.
- **SonarJS on the whole project**: `main` has no SonarJS findings, so a new rule or a plugin upgrade is checked on every file.
- **Biome config validation**: Biome loads `biome.json` and fails on an invalid config. Biome does not run on the whole project, because `main` still has older Biome findings.
- **workflow validation**: `scripts/quality/check-workflows.ts` parses every workflow and checks that `quality.yml` keeps the merge contract: the job is named `Quality`, it runs on `pull_request` with no `paths` or `paths-ignore` filter, it has no `if` condition, and it installs with `bun install --frozen-lockfile` and runs `bun run quality`.

A change to `doctor.config.json` gets no extra check: React Doctor still has older findings on `main`, so it cannot run on the whole project yet.

The tests for the selection are in `src/test/quality-changes.test.ts` (temporary git repositories) and `src/test/quality-workflow.test.ts`.

### Policy

Fix the cause of a finding. Do not suppress a rule or change a threshold to pass the gate. If a finding is a false positive, suppress it on that line with a reason, and say so in the pull request.

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

The `Quality` check (job in `quality.yml`) is the only required check. Issue #31 adds more checks. Use a stable job name for each one. Then add the name to `required_status_checks` in the ruleset. Do not use a `paths` filter on a required workflow: the workflow does not run, and the check stays pending and blocks the merge. Do not use an `if` condition on a required job: GitHub counts a skipped job as a pass, so the merge goes through without the gate. `scripts/quality/check-workflows.ts` enforces this for `quality.yml`.

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
