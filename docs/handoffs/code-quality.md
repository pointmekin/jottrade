# Code quality: handoff

PR [#27](https://github.com/pointmekin/jottrade/pull/27), branch `refactor/code-quality`. It is stacked on #24 (`feat/metrics-phase-2`), which is stacked on #23. Do not merge any of them.

## State

- `npm run quality` is the gate. Read "Quality gate" and "Code style" in `AGENTS.md` first.
- The gate checks changed files only, because `main` still has the findings below. When you touch a file, make the whole file clean.
- `tsc --noEmit` has 0 errors. Vitest: 31 files, 237 tests.
- New worktrees have no `node_modules`. Copy them with `cp -Rc ~/Desktop/Projects/tradebase/jottrade/node_modules ./node_modules`.

## Remaining findings on `main`

Fix them in small PRs, one area each. Run `npm run doctor`, `npx eslint .` and `npx biome lint` to see the full list.

1. **Command module** (`src/lib/commands/*`, `src/components/command-palette/command-palette.tsx`).
   - `CommandPalette` has cognitive complexity 25 and is 154 lines long. Split it.
   - `intent-schema.ts`: cognitive complexity and a nested ternary. `registry.ts`: a nested ternary.
   - `parsers/trade.ts` and `parsers/account-entry.ts`: regex complexity and an inverted boolean check.
   - The command module still compares intent types with inline strings. Use `IntentType` from `src/lib/commands/types.ts`.
2. **`src/hooks/use-speech-input.ts`**: React Doctor reports an error: a ref is mutated during render.
3. **`src/routes/__root.tsx`**: `dangerouslySetInnerHtml` for the theme script. React warns about a script tag during render.
4. **Hydration warnings**: `_authenticated/route.tsx` renders a spinner on the server and the page on the client. The bottom-nav initial differs between server and client. These existed before #23.
5. **Template demo routes** (`src/routes/demo/*`, `src/data/demo*`): they are public and have lint errors. The owner decides whether to delete them.
6. **`getAccounts`** (`src/server/portfolioActions.ts`) creates the default account inside a GET. It is suppressed with a reason. The real fix is to create it in a Better Auth sign-up hook.
7. **Calendar metric rule**: `getCalendarData` sums trades by exit date. The dashboard uses `closedTradesInRange` (status `CLOSED`, exit time or entry time). A closed trade without an exit date is missing from the calendar. This is a behavior change; add a test first.
8. **Other SonarJS findings**: a nested ternary in `CalendarDayCell.tsx`; `public-static-readonly` in `command-palette-speech.test.tsx`; a trivial assertion in `instruments.test.ts`.

## Owner decisions

- Make the "Quality" CI check required with branch protection.
- Delete or keep the demo routes.
