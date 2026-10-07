# Owner to-do: production deploys

Production deploys run in GitHub Actions (`.github/workflows/deploy.yml`). The workflow does these steps in this sequence:

1. It builds the app with `vercel build --prod`.
2. It applies the Drizzle migrations to the production database (`bun run db:migrate`).
3. It deploys the prebuilt output with `vercel deploy --prebuilt --prod`.

If the build fails, the workflow does not migrate. If the migration fails, the workflow does not deploy.

Do the steps below in this sequence. Text in angle brackets, for example `<your-token>`, is a placeholder. Replace it with your value.

## 1. Vercel: get the token and the IDs

- [ ] Open Vercel, go to **Account Settings → Tokens**, and create a token. Name it `jottrade-github-deploy`. Set its scope to the team that owns the project. Copy the token. You cannot see it again. If you set an expiry date, record it: deploys stop when the token expires.
- [ ] Do not use `VERCEL_OIDC_TOKEN` (from `vercel env pull`) as the token. It expires after a short time and cannot authorise CLI deploys.
- [ ] Get the org ID: open the team, go to **Settings → General**, and copy the **Team ID** (`team_...`). For a personal account, use the **User ID** from **Account Settings**.
- [ ] Get the project ID: open the jottrade project, go to **Settings → General**, and copy the **Project ID** (`prj_...`).

## 2. Neon: get the production connection string

- [ ] Open the Neon console. Select the production project and the production branch.
- [ ] Click **Connect**. Turn off **Connection pooling**.
- [ ] Copy the connection string. The host name must not contain `-pooler`. The workflow uses this direct connection for migrations only.
- [ ] Optional, but recommended: before you merge, open the Neon **SQL Editor** and run this query:

  ```sql
  SELECT count(*) FROM drizzle.__drizzle_migrations;
  ```

  The result must be `7`: one row for each migration from `0000` to `0006`. If the table does not exist, or if the count is less than `7`, stop. In this condition, the first deploy tries to create tables that exist and the migration fails. Decide how to align the migration history before you continue.

## 3. GitHub: create the environment and the secrets

- [ ] Go to **Settings → Environments**. Create an environment with the name `production`. If an environment with this name exists (Vercel can create one), use it.
- [ ] In the `production` environment, add these 4 environment secrets:

  | Secret | Value |
  | --- | --- |
  | `VERCEL_TOKEN` | `<token from step 1>` |
  | `VERCEL_ORG_ID` | `<orgId from .vercel/project.json>` |
  | `VERCEL_PROJECT_ID` | `<projectId from .vercel/project.json>` |
  | `PRODUCTION_DATABASE_URL` | `<direct Neon connection string from step 2>` |

- [ ] Optional: under **Deployment protection rules**, add yourself as a **Required reviewer**. Then each production deploy waits for your approval.
- [ ] Optional: under **Deployment branches and tags**, select **Selected branches and tags** and add `main`.

If a secret is missing, the first workflow step fails. The error message gives the names of the missing secrets.

## 4. Merge the deploy pull request and check the first run

- [ ] Merge the deploy pull request only after the 4 secrets exist.
- [ ] Go to **Actions → Deploy**. Open the run for the merge commit.
- [ ] In the step **Migrate production database**, make sure that the log shows that migrations were applied with no error. This run applies migration `0007_absent_killraven`.
- [ ] In the step **Deploy**, make sure that the log shows a production URL.
- [ ] Optional: run the query from step 2 again. The result must be `8`.

To start a deploy manually:

- [ ] Go to **Actions → Deploy → Run workflow**. Select the branch `main`. Click **Run workflow**.

Or, with the GitHub CLI:

```bash
gh workflow run deploy.yml --ref main
```

The workflow deploys only from `main`. A manual run on a different branch does nothing.

## 5. Vercel: check auto-deploy and previews

- [ ] Push a commit to `main` (or merge a pull request). Make sure that Vercel does not start its own production deployment. Only the GitHub Actions workflow must deploy. `vercel.json` sets `git.deploymentEnabled.main` to `false`.
- [ ] Open a pull request. Make sure that Vercel still adds a preview deployment to it.

## 6. GitHub: require the Quality check on `main`

- [ ] Create the `main` branch ruleset that requires the `Quality` check. Follow [docs/quality-gate.md](quality-gate.md), section "Owner action: protect `main`".
- [ ] After you do this, a pull request cannot merge until the `Quality` check passes.

## 7. App: set the review timezone for each account

- [ ] Sign in to the production app. Go to **Settings**.
- [ ] For each trading account, select the account. In **Account review preferences**, set the timezone. Click **Save review preferences**.

Daily and weekly reviews do not work for an account until it has a review timezone. The server stops with the message "Choose your review timezone first." (see `src/db/reviews.ts`).

## 8. Rollback

To go back to a previous build:

- [ ] Open Vercel, go to the project, and open **Deployments**.
- [ ] Find the last production deployment that worked. Open its menu and select **Instant Rollback** (or **Promote**).
- [ ] Or, with the Vercel CLI: `vercel rollback <deployment-url> --token=<your-token>`.

After an Instant Rollback, Vercel does not move the production domain to new deployments automatically. When the fix is on `main` and deployed, promote that deployment (or undo the rollback) in Vercel.

Migrations have no down step. Roll back the code only. Keep the database schema as it is. Thus, each migration must work with the code that was live before it. If a migration is wrong, write a new migration that corrects it, and deploy it.

## 9. Other open items

These items are not about deploys. They come from the audit of the merged work for #9, #10 and #11.

- [ ] Close issues #9, #10 and #11. Their pull requests (#35, #37, #36) are merged, and the audit found that they meet their acceptance criteria. #10 meets its undo criterion only partly (see the next item).
- [ ] Create follow-up issues for the bugs that the audit found, or ask Claude to fix them:
  - Import undo marks the restored version's identity as superseded, so the corrected file cannot be imported again (`src/db/import-undo-sql.ts`).
  - A cancelled screenshot upload increases `editRevision`, so undo protects a trade that did not change (`src/server/imageActions.ts`).
  - When a review protects a cash flow, a delete shows "Cash flow not found" instead of a review message (`src/server/cashFlowActions.ts`).
- [ ] Resolve or answer the open Codex review threads on #35, #36 and #37.
- [ ] Optional: collect real, sanitised Exness exports with partial closes to verify imports (#10 release evidence).
