# Handoff: make trade dates timezone-aware

## Task

Fix the P0 date and time bug so calendar dates and date-based analytics use the user's local timezone. The reported user is in Thailand, UTC+7. A trade closed late Friday local time must appear on Friday, not Saturday.

Work on this task only. Inspect the code first, write regression tests before the implementation, run focused and full verification, and commit the result with a concise Conventional Commit message. Do not push.

When this task is complete, write the next handoff document and create a new Codex task for "Add delete trade entry functionality". Tell that task to continue the same one-change-per-task chain described below.

## Context

The original request contains six sequential changes, one per Codex task:

1. Correct equity and balance calculations. Completed in commit `fix: correct gold trade pnl calculations` immediately before this handoff.
2. Make trade dates aware of the user's local timezone. This is your task.
3. Add delete trade entry functionality.
4. Fix the calendar journal-entry slider so it appears at desktop sizes as well as mobile.
5. Change navigation in `src/components/app-sidebar.tsx` to use mouse-down instead of click for a snappier response.
6. Redesign `src/components/journal/FilterBar.tsx` so it is visually distinct from generic journal-entry cards.

Each task must implement and commit exactly one item, write a self-contained handoff under `docs/handoffs/`, and create the next Codex task. The sixth task stops after its commit and final report.

## Relevant files

- `src/lib/analytics.ts` contains `toUtcDay`, equity-curve grouping, and `groupByDay`. It currently groups by UTC.
- `src/server/calendarActions.ts` groups closed trades for the calendar and currently derives UTC date keys.
- `src/server/rangeInput.ts` parses reporting ranges and may define UTC boundaries.
- `src/components/calendar/` renders the calendar and day trade details.
- `src/components/journal/ImportZone.tsx` correctly parses explicitly named broker UTC timestamp columns into UTC instants. Preserve that behavior.
- `src/test/analytics.test.ts` contains the analytics and equity regression suite.
- `src/test/period.test.ts` covers reporting ranges.

## Current state

The equity fix now:

- Applies the Exness XAUUSD contract size of 100 to manual gold trades, including suffixed symbols such as `XAUUSDm`.
- Keeps broker-reported P&L authoritative for imported trades when users edit journal metadata.
- Passes all 42 tests and the production build.
- Corrected the two affected live database rows from `0.26` each to `25.60` and `25.62`.

The full Biome check has pre-existing `noImplicitAnyLet` errors in `src/server/tradeActions.ts` and `src/server/importActions.ts`. Do not broaden the timezone task to clean these up unless your own change requires those lines.

## What was tried

- The equity reducer was inspected and found to sum stored `netPnl` correctly. The bad value originated earlier in manual XAUUSD P&L calculation.
- A first live data correction query failed at SQL parsing because shell quoting altered the statement. Its transaction rolled back and changed no rows. The corrected transaction then updated exactly two rows.

## Decisions

- Broker timestamps remain stored as real UTC instants. Presentation and day grouping should convert those instants to the user's timezone.
- Do not hardcode Thailand or UTC+7. Use the browser-resolved timezone or an existing persisted user setting if the repository already has one.
- Prefer a single timezone-aware day-key utility used by calendar and analytics over scattered offset arithmetic.
- Preserve correct period filtering around local day boundaries. Test a Friday-night Thailand case and a UTC date rollover.

## Acceptance criteria

- [ ] A closed trade whose UTC instant is Friday in Asia/Bangkok groups under Friday.
- [ ] Calendar, equity curve, and date-range boundaries agree on the same user-local day.
- [ ] The implementation works for arbitrary IANA timezones and is not hardcoded to UTC+7.
- [ ] Existing UTC parsing of broker CSV timestamps remains correct.
- [ ] Regression tests cover the reported Friday/Saturday boundary.
- [ ] Focused tests, the full suite, and the production build pass.
- [ ] The change is committed and the next delete-entry task is created with a new handoff.

## Constraints

- Follow `AGENTS.md`. Apply `andrej-karpathy-skills:karpathy-guidelines` before coding.
- Keep the change surgical and reuse existing date utilities where possible.
- Do not edit generated `src/routeTree.gen.ts`.
- Do not commit secrets, generated build output, or unrelated cleanup.
- Do not push.
