# Development database

Use a local PostgreSQL database with synthetic data for development and
verification. Do not use the production database for this work.

## Quick start

```sh
bun install            # or: npm install
npm run db:setup       # local server + this worktree's database + migrate + seed
npm run dev            # http://localhost:3000
```

Sign in with any seeded user. All of them use the password
`jottrade-dev-password`:

| Email                 | Data                                                                 |
| --------------------- | -------------------------------------------------------------------- |
| `alice@jottrade.test` | 3 accounts (USD real, USD demo, EUR real), 45 trades, 7 cash flows, 3 strategies, 5 tags (18 trade links) |
| `bob@jottrade.test`   | 2 accounts, 4 trades (stocks and fractional BTC), 1 strategy, 1 tag   |
| `erin@jottrade.test`  | 1 account, no trades, no cash flows, no strategies                    |
| `nora@jottrade.test`  | No trading account                                                   |
| `sam@jottrade.test`   | One account with 55 closed trades (more than one journal page)       |

`npm run db:setup` does these steps:

1. It reads `.env`. If `.env` sets an unsafe `DATABASE_URL` (see
   [Safety rules](#safety-rules)), setup stops and changes nothing.
2. It starts a local PostgreSQL server on `127.0.0.1:54329` if no server
   listens there.
3. It creates the database for this worktree, for example
   `jottrade_dev_jottrade_7b7fa58d`.
4. It fills the empty `.env` keys `DATABASE_URL`, `DATABASE_DRIVER=pg`,
   `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, also when `DATABASE_URL` is
   already set. `DATABASE_DRIVER=pg` is written only for the local server. It creates `.env` from
   `.env.example` if necessary. It never replaces a value that is set.
5. It applies the migrations in `drizzle/`. It seeds the data only when the
   database is new or has no users.

You can run setup again at any time. It does not delete data. To go back to
the seed data, use `npm run db:reset`.

## Commands

| Command                      | Effect                                                              | Destructive |
| ---------------------------- | ------------------------------------------------------------------- | ----------- |
| `npm run db:setup`           | Steps 1–5 above.                                                    | No          |
| `npm run db:server -- start` | Starts the local server. `stop` and `status` are also available.    | No          |
| `npm run db:dev:migrate`     | Applies new migrations to `DATABASE_URL`.                           | No          |
| `npm run db:seed`            | Deletes all rows in `DATABASE_URL`, then inserts the seed data.     | Yes         |
| `npm run db:reset`           | Drops all tables in `DATABASE_URL`, migrates, then seeds.           | Yes         |
| `npm run db:drop`            | Drops the `DATABASE_URL` database.                                  | Yes         |
| `npm run db:check`           | Tells if `DATABASE_URL` is a safe target. Writes nothing.           | No          |
| `npm run db:list`            | Lists the `jottrade_*` databases on the server.                     | No          |

The commands read `DATABASE_URL` from the environment first, then from
`.env`. A value in the environment always wins. The source is in
`scripts/db/`.

The existing `db:migrate`, `db:push`, `db:pull` and `db:studio` scripts call
`drizzle-kit` directly. They have no safety guard. See
[Production migrations](#production-migrations).

## Safety rules

`db:setup`, `db:dev:migrate`, `db:seed`, `db:reset`, `db:drop` and `db:check`
refuse the target unless all of these are true:

- `DATABASE_URL` is set and is a `postgres://` or `postgresql://` URL.
- The database name matches `^jottrade_(dev|test)(_[a-z0-9_]+)?$` and has
  63 characters or fewer. The name is the explicit statement that the
  database is for development or test. Production names such as `neondb` or
  `jottrade` fail this rule.
- The host is local: `localhost`, `127.0.0.1`, `[::1]`, or a Unix socket
  path. A remote host, for example `*.neon.tech`, is accepted only when
  `JOTTRADE_DB_ALLOW_REMOTE_HOST` is set to that exact host name.
- `NODE_ENV` is not `production`.

When a rule fails, the command prints the reason and exits with code 1
before it connects to the database. Example:

```text
$ DATABASE_URL='postgresql://u:p@ep-x.us-east-2.aws.neon.tech/neondb' npm run db:reset
Refusing database target: Database "neondb" is not an explicit development or test target. ...
```

Do not set `JOTTRADE_DB_ALLOW_REMOTE_HOST` for a production host. Use it only
for a disposable Neon branch (see [Why local PostgreSQL](#why-local-postgresql)).

## Configuration

| Variable                        | Default                                 | Purpose                                                                 |
| ------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                  | (setup fills it)                        | Server-only connection string. Never use a `VITE_` prefix: Vite puts `VITE_*` values in the browser bundle. |
| `DATABASE_DRIVER`               | `neon`                                  | `pg` for a plain PostgreSQL server. Production leaves it empty.         |
| `JOTTRADE_DB_NAME`              | `jottrade_dev_<folder>_<path hash>`     | Database name that `db:setup` uses when `DATABASE_URL` is empty.        |
| `JOTTRADE_DB_ALLOW_REMOTE_HOST` | (none)                                  | The one remote host that the commands can write to.                    |
| `JOTTRADE_PG_PORT`              | `54329`                                 | Port of the local server.                                               |
| `JOTTRADE_PG_DIR`               | `~/.local/state/jottrade/postgres`      | Data directory of the local server. As root: `/var/lib/jottrade/postgres`. |
| `JOTTRADE_PG_BIN`               | (search)                                | Folder with `initdb` and `pg_ctl`. The scripts also search `PATH`, `/usr/lib/postgresql/<n>/bin` and Homebrew. |
| `JOTTRADE_PG_MODE`              | (native)                                | `docker` runs `postgres:16-alpine` in the container `jottrade-postgres` instead of local binaries. |

The local server accepts only connections from `127.0.0.1`. Its user and
password are `jottrade` / `jottrade`. Use it only for synthetic data.

When the scripts run as root (for example in a cloud agent container), they
run the server as the `postgres` system user, because PostgreSQL refuses to
run as root.

## Database client

All application code imports `db` from `@/db`, which is `src/db/index.ts`.
`DATABASE_DRIVER` selects the transport:

- `neon` (default): the Neon HTTP driver. Production uses this.
- `pg`: a node-postgres pool (`src/db/pg-transport.ts`) that implements the
  part of the Neon query function that `drizzle-orm/neon-http` uses. The
  `db` object, including `db.batch`, is the same in both cases. A batch runs
  in one `BEGIN`/`COMMIT` transaction, as it does on Neon.

Before this change, `src/db.ts` (Neon HTTP) and `src/db/index.ts`
(node-postgres, without `db.batch`) both existed. `@/db` resolved to
`src/db.ts`, because a file wins over a folder index in module resolution.
`src/db/index.ts` was not used. Now only `src/db/index.ts` exists.

## Several worktrees and verification runs

Each worktree gets its own database, because the name contains a hash of the
worktree path. All worktrees share one local server. A reset in one worktree
does not change the data of another worktree.

`npm run verify` creates and drops its own `jottrade_test_verify_*` database
(see [quality-gate.md](quality-gate.md)). For another disposable run, set `DATABASE_URL` to a
`jottrade_test_*` database. The commands create it if it does not exist:

```sh
export DATABASE_URL=postgresql://jottrade:jottrade@127.0.0.1:54329/jottrade_test_run42
export DATABASE_DRIVER=pg
npm run db:reset       # creates, migrates and seeds
# ... run the app or tests against it ...
npm run db:drop        # cleanup
```

Limits:

- Two processes must not run `db:seed` or `db:reset` on the same database at
  the same time. Use one database for each run.
- Only one dev server can run at a time on port 3000 (the TanStack devtools
  also use port 42069). Use a different `--port` for a second dev server and
  set `BETTER_AUTH_URL` to match.
- Concurrent runs share the CPU, memory and the default limit of 100
  connections of the local server. Each app process opens a pool of up to 10
  connections.

## Cleanup

```sh
npm run db:list                 # see all jottrade_* databases
npm run db:drop                 # drop this worktree's database
npm run db:server -- stop       # stop the local server
```

Drop the database before you delete a worktree. Otherwise it stays on the
server; use `db:list` to find it and run `db:drop` with that `DATABASE_URL`.
To remove everything, stop the server and delete `JOTTRADE_PG_DIR` (for
Docker: `docker rm -f jottrade-postgres && docker volume rm jottrade-postgres`).

## Migrations

`db:setup`, `db:dev:migrate` and `db:reset` apply `drizzle/` with the Drizzle
migrator. Applied migrations are recorded in `drizzle.__drizzle_migrations`.

Migration `0001` drops a table `todos` that no migration creates. On an empty
database the scripts create an empty `todos` table first, so the full history
applies. They do this only when no migration is recorded.

To add a migration, change `src/db/schema.ts`, run `npm run db:generate`,
then `npm run db:dev:migrate`. Check the generated SQL before you commit it.

### Failure and recovery

- All pending migrations run in one transaction. If a statement fails, all of
  them roll back and the database stays at the last applied migration. The
  error names the statement. Fix the cause, then run
  `npm run db:dev:migrate` again.
- If the local database is in an unknown state, run `npm run db:reset`. It
  drops the `public` and `drizzle` schemas and builds them again from the
  migrations.
- `db:seed` runs in one transaction. If it fails, the old rows stay.
- If the server does not start, read `server.log` in `JOTTRADE_PG_DIR`. A
  second server on port 54329 or a stale `postmaster.pid` is the usual cause.

### Production migrations

Production migrations are a separate, explicit step. No setup, start or
verification command runs them. To migrate production, an owner sets the
production URL for that one command only, after a backup or a Neon branch
snapshot:

```sh
DATABASE_URL='<production url>' npm run db:migrate
```

Do not keep the production URL in `.env`: `db:setup` refuses to run while it
is there, and `npm run dev` would use it.

## Why local PostgreSQL

| Topic           | Local PostgreSQL (chosen)                              | Neon branch                                                   |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Network, account | None. Works offline and in agent containers.          | Needs the Neon account, an API key and network access.        |
| Production risk | No production credentials on the machine.              | The branch is in the production project. A wrong URL reaches production. |
| Speed, cost     | Setup in about 3 s; a reset in about 1 s. Free.        | Branch create and cold start take seconds; branches count against plan limits. |
| Parallel runs   | One database per worktree or run on one server.        | One branch per worktree; cleanup needs the Neon API.          |
| Fidelity        | Same PostgreSQL SQL. Uses the `pg` transport, not Neon HTTP. | Exact production driver and platform.                   |

Local PostgreSQL is the supported path. The `pg` transport keeps the
application code and the drizzle API the same, so only the network layer
differs from production. To check something that depends on Neon HTTP
itself, use a Neon branch whose database name is `jottrade_dev_*`, set
`DATABASE_DRIVER=neon`, and set `JOTTRADE_DB_ALLOW_REMOTE_HOST` to the branch
host.
