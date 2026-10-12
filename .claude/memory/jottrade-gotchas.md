# JotTrade gotchas (from issue #19 slice A, PR #71)

- A jsonb column typed `$type<unknown>()` on `trades` breaks the `createServerFn` serialization type check in `getTrades.ts`. Use a serializable type.
- `account-deletion.integration.test.ts` needs a fixture row in every table with an FK to `user`. Add one for each new user-owned table.
- In integration tests, create rejected server-function calls lazily (`() => fn()`). Eager promises in an array give an unhandled rejection, and `npm run verify` fails.
- SonarJS `super-linear-regex` flags `/0+$/`. Use plain string code.
- The verify DB tests are listed in `DATABASE_TESTS` in `scripts/verify/run.ts`. `user-isolation.integration.test.ts` is near 500 lines, so add new files.
- For E2E specs with no shared data, sign up a new user (`/api/auth/sign-up/email`). A new user has no review timezone.
- A Biome a11y rule wants `<output>` in place of `role="status"`.
