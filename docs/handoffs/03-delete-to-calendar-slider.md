# Handoff: show the calendar journal-entry slider on desktop

## Task

Fix the calendar day journal-entry slider so it appears at desktop sizes as well as mobile. A user who selects a calendar day with trades should get the intended slide-over trade list on both viewport classes and should still be able to open a specific journal entry from it.

Work on this task only. Read `AGENTS.md` in full, apply its required coding skills, inspect the current responsive calendar detail path before editing, write regression tests before implementation, run proportional and full verification, and commit the result with a concise Conventional Commit message. Do not push.

When this task is complete, write the next handoff document and create a new Codex task for "Use mouse-down for sidebar navigation". Tell that task to continue the same one-change-per-task chain described below.

## Context

The original request contains six sequential changes, one per Codex task:

1. Correct equity and balance calculations. Completed.
2. Make trade dates aware of the user's local timezone. Completed.
3. Add delete trade entry functionality. Completed in the commit immediately before this handoff.
4. Fix the calendar journal-entry slider so it appears at desktop sizes as well as mobile. This is your task.
5. Change navigation in `src/components/app-sidebar.tsx` to use mouse-down instead of click for a snappier response.
6. Redesign `src/components/journal/FilterBar.tsx` so it is visually distinct from generic journal-entry cards.

Each task must implement and commit exactly one item, write a self-contained handoff under `docs/handoffs/`, and create the next Codex task from its committed branch or ref. The sixth task stops after its commit and final report.

## Current state

The delete-entry change now:

- Adds a destructive action to the existing journal trade detail page.
- Requires confirmation that names the symbol, side, and entry date.
- Prevents duplicate deletion requests and keeps the dialog open with an error message when deletion fails.
- Validates the delete payload, authenticates the request, and scopes deletion by trade ID and current user ID.
- Invalidates journal, selected-trade, calendar, and both analytics query families before returning to the journal.
- Passes all 54 tests and the production build.

The repository-wide Biome check still has pre-existing errors and warnings in unrelated files. The delete dialog and its regression test pass focused Biome checks, and the delete change introduces no TypeScript errors.

## Relevant files

- `src/components/calendar/DayTradesPopover.tsx` owns the responsive day-detail UI. It currently renders a bottom `Drawer` only when `useIsMobile()` is true and renders a `Popover` on larger screens.
- `src/components/calendar/CalendarGrid.tsx` owns the selected date and passes controlled open state plus `onTradeClick` into `DayTradesPopover`.
- `src/components/calendar/CalendarDayCell.tsx` is the trigger for days with trades.
- `src/components/ui/drawer.tsx` is the existing slider primitive. Inspect its supported directions and nearby responsive drawer patterns before changing layout.
- `src/routes/_authenticated/calendar.tsx` owns the calendar query and page layout.
- `src/routes/_authenticated/journal_.$tradeId.tsx` is the destination for a selected trade. Preserve this navigation flow.
- `src/hooks/use-mobile.ts` defines the current breakpoint behavior.

## Acceptance criteria

- [ ] Selecting a calendar day with trades opens the journal-entry slider on desktop and mobile.
- [ ] The desktop slider is sized and positioned for a desktop viewport and does not cover the entire page unnecessarily.
- [ ] The mobile slider keeps the current usable bottom-sheet behavior.
- [ ] The slider clearly identifies the selected date, trade count, and net P&L and lists the day's trades.
- [ ] Selecting a trade closes the slider and navigates to `/journal/$tradeId`.
- [ ] Closing the slider clears the selected day without changing calendar data or month state.
- [ ] Regression tests cover both desktop and mobile rendering at the smallest practical layer.
- [ ] Focused tests, the full suite, and the production build pass.
- [ ] The change is committed and the next sidebar mouse-down task is created with a new handoff.

## Constraints

- Follow `AGENTS.md` and apply `andrej-karpathy-skills:karpathy-guidelines` before coding.
- Use TDD and keep the change surgical.
- Reuse the existing drawer primitive and responsive patterns. Do not add a dependency.
- Preserve the calendar timezone behavior and journal-entry route.
- Do not work on the sidebar navigation event or FilterBar redesign in this task.
- Do not edit generated `src/routeTree.gen.ts`.
- Do not commit secrets, generated build output, or unrelated cleanup.
- Do not push.
