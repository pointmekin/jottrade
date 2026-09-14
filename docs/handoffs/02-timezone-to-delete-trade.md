# Handoff: add delete trade entry functionality

## Task

Add complete delete functionality for a journal trade entry. A user must be able to start deletion from the trade UI, understand which trade will be removed, confirm or cancel, and see the journal and dependent analytics refresh after a successful delete.

Work on this task only. Read `AGENTS.md` in full, apply its required coding skills, inspect the existing delete path before editing, write regression tests before implementation, run proportional and full verification, and commit the result with a concise Conventional Commit message. Do not push.

When this task is complete, write the next handoff document and create a new Codex task for "Fix the calendar journal-entry slider on desktop". Tell that task to continue the same one-change-per-task chain described below.

## Context

The original request contains six sequential changes, one per Codex task:

1. Correct equity and balance calculations. Completed.
2. Make trade dates aware of the user's local timezone. Completed in the commit immediately before this handoff.
3. Add delete trade entry functionality. This is your task.
4. Fix the calendar journal-entry slider so it appears at desktop sizes as well as mobile.
5. Change navigation in `src/components/app-sidebar.tsx` to use mouse-down instead of click for a snappier response.
6. Redesign `src/components/journal/FilterBar.tsx` so it is visually distinct from generic journal-entry cards.

Each task must implement and commit exactly one item, write a self-contained handoff under `docs/handoffs/`, and create the next Codex task from its committed branch or ref. The sixth task stops after its commit and final report.

## Current state

The timezone fix now:

- Resolves the browser's IANA timezone and passes it to calendar and analytics server functions.
- Groups calendar days, equity points, daily P&L, weekday analytics, and hourly analytics in that timezone.
- Uses browser-local month bounds for calendar queries and a half-open end boundary.
- Converts manual `datetime-local` values into UTC instants before sending them to the server.
- Preserves the explicit UTC interpretation of broker CSV timestamp columns.
- Passes all 50 tests and the production build.

The repository-wide Biome check still has pre-existing errors and warnings in unrelated files. Changed files for the timezone task have no Biome errors.

## Relevant files

- `src/server/tradeActions.ts` already exports a `deleteTrade` server function. Confirm its validation, authentication, and user-ownership constraint before deciding whether it needs a small change.
- `src/components/journal/TradeDetailSheet.tsx` is the existing detail and edit surface for a selected trade.
- `src/components/journal/JournalTable.tsx` renders journal rows and cards and opens trade details.
- `src/routes/_authenticated/journal.tsx` owns journal queries, selection, sheets, and URL state.
- `src/components/ui/alert-dialog.tsx` or an existing confirmation primitive should be reused if present. Search before adding UI primitives or dependencies.
- Calendar trade details may link into the same journal detail route. Preserve that flow.

## Acceptance criteria

- [ ] A signed-in user can start deleting a specific trade from an appropriate existing trade-detail surface.
- [ ] The UI requires explicit confirmation and clearly identifies the trade being deleted.
- [ ] Cancel leaves the trade and current UI state unchanged.
- [ ] Confirm deletes only the selected trade owned by the current user.
- [ ] The UI prevents duplicate submissions and shows a useful failure state if deletion fails.
- [ ] After success, the detail UI closes or navigates safely and invalidates every affected query, including journal, calendar, and analytics data.
- [ ] Regression tests cover confirm, cancel, and successful cache or UI refresh behavior at the smallest practical layer.
- [ ] Focused tests, the full suite, and the production build pass.
- [ ] The change is committed and the next desktop calendar-slider task is created with a new handoff.

## Constraints

- Follow `AGENTS.md` and apply `andrej-karpathy-skills:karpathy-guidelines` before coding.
- Use TDD and keep the change surgical.
- Reuse the existing authenticated, ownership-scoped server action rather than creating a parallel endpoint unless inspection finds a concrete defect.
- Do not redesign the trade detail UI beyond what deletion needs.
- Do not work on the calendar slider, sidebar event change, or FilterBar redesign in this task.
- Do not edit generated `src/routeTree.gen.ts`.
- Do not commit secrets, generated build output, or unrelated cleanup.
- Do not push.
