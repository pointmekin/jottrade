# Code quality: handoff

> **Historical.** This document records past work. Its instructions are not active, and its file paths and status may be out of date. For the current state, read [README.md](../../README.md), [AGENTS.md](../../AGENTS.md) and [docs/feature-map.md](../feature-map.md).

PR [#27](https://github.com/pointmekin/jottrade/pull/27), branch `refactor/code-quality`. It was stacked on #24 (`feat/metrics-phase-2`), which was stacked on #23. #23, #24, #27 and the follow-up #28 merged on 2026-09-30.

## State

- `npm run quality` is the gate. Read "Quality gate" and "Code style" in `AGENTS.md` first.
- The gate checks changed files only, because `main` still has the findings below. When you touch a file, make the whole file clean.
- `tsc --noEmit` has 0 errors. Vitest: 32 files, 244 tests.
- Install dependencies with `bun install --frozen-lockfile` (see [README.md](../../README.md)).

## Done in the follow-up PR

The follow-up branch was `refactor/code-quality-followups` (PR #28, merged).

1. **Command module.** `CommandSearch` (`command-search.tsx`) and `useCommandShortcut` now hold the search UI and the keyboard shortcut. `toCommandCandidate` has one function for each intent. The parsers use smaller regexes. The module uses `IntentType`, `CommandTheme`, `TradeSide` and `isWriteIntent`, not inline strings.
2. **`use-speech-input.ts`.** An effect writes the transcript ref, not the render.
3. **`__root.tsx`.** `ScriptOnce` renders the theme script. The script runs only on the server render and removes itself.
4. **Hydration.** `_authenticated/route.tsx` and `bottom-nav.tsx` use `useHydrated`, so the first client render matches the server. Chrome showed no console errors on `/dashboard`, `/calendar`, `/journal` and `/settings`.
7. **Calendar metric rule.** `groupTradesByDay` (`src/lib/calendar-days.ts`) uses the dashboard rule: a `CLOSED` trade adds P&L on its exit day, or on its entry day when it has no exit date. Other trades show on the entry day without P&L. `src/test/calendar-days.test.ts` covers the rule.
8. **Other SonarJS findings.** `CalendarDayCell.tsx`, `command-palette-speech.test.tsx` and `instruments.test.ts` are clean.

## Remaining findings on `main`

5. **Template demo routes** (`src/routes/demo/*`, `src/data/demo*`): they are public and have lint errors. The owner decides whether to delete them.
6. **`getAccounts`** (`src/server/portfolioActions.ts`) creates the default account inside a GET. It is suppressed with a reason. The real fix is to create it in a Better Auth sign-up hook. Issue #33 tracks this.

The auth guard in `_authenticated/route.tsx` is still client-side. The server renders a spinner, then the client checks the session. A `beforeLoad` guard with a server session check would render the page on the server. That is a larger change with a cost on each navigation, so it is not done.

## Owner decisions

- Make the "Quality" CI check required with branch protection. Issue #32 tracks this.
- Delete or keep the demo routes.
