# Handoff: redesign the journal FilterBar

## Task

Redesign `src/components/journal/FilterBar.tsx` so the journal filters read as a purpose-built toolbar rather than generic journal-entry cards.

Work on this task only. Read `AGENTS.md` and `DESIGN.md` in full before acting, apply the required coding and frontend design skills, inspect the rendered journal structure and nearby UI patterns, write regression tests before implementation, make the smallest complete visual change, run proportional and full verification, and commit with a concise Conventional Commit message. Do not push.

This is the final item in the task chain. After committing, report the result and stop. Do not write another handoff or create another task.

## Context

The original request contains six sequential changes, one per Codex task:

1. Correct equity and balance calculations. Completed.
2. Make trade dates aware of the user's local timezone. Completed.
3. Add delete trade entry functionality. Completed.
4. Show the calendar journal-entry slider at desktop sizes as well as mobile. Completed.
5. Navigate from desktop sidebar links on mouse-down. Completed in the commit immediately before this handoff.
6. Redesign the journal FilterBar so it is visually distinct from generic journal-entry cards. This is your task.

Each task implements and commits exactly one item. Task 6 ends after its commit and final report.

## Current state

The sidebar change now:

- Starts navigation for each of the five desktop sidebar destinations on an unmodified primary-button mouse-down.
- Cancels the subsequent pointer click so it cannot navigate twice.
- Leaves keyboard activation, modified clicks, non-primary buttons, link URLs, active styling, tooltips, collapsed behavior, account actions, and mobile navigation unchanged.
- Adds component regression coverage in `src/test/app-sidebar.test.tsx`.
- Passes all 59 tests and the production build.

Repository-wide Biome and `tsc --noEmit` still report pre-existing issues in unrelated files. Focused Biome checks for the sidebar change pass.

## FilterBar starting point

- `src/routes/_authenticated/journal.tsx` renders `FilterBar` between `AppPageHeader` and `JournalTable`.
- `FilterBar.tsx` currently wraps both its compact control row and expanded filter grid in `.surface`, making them resemble the card containers used throughout the journal.
- The compact row contains the period picker, filter toggle with active count, and clear-all action.
- The expanded area contains symbol, side, status, strategy, and confidence controls in a responsive two-column/four-column grid.
- Active period and filter chips render below those controls.
- `DESIGN.md` calls for a quiet, information-dense toolbar row under page headings, neutral grounds, thin dividers, sentence-case labels, 6–8px radii, and accent blue only for action, selection, and focus.
- There is no dedicated FilterBar component test yet. Add the smallest practical regression coverage for the preserved interactions and the new toolbar hierarchy or styling contract.

## Acceptance criteria

- [ ] The compact filter controls and expanded filter area are visually identifiable as journal filtering UI, not generic journal-entry cards.
- [ ] The result follows `DESIGN.md`: restrained neutral styling, clear hierarchy, compact density, thin boundaries where useful, and no decorative market colors.
- [ ] The collapsed state remains compact and works at mobile and desktop widths.
- [ ] Period selection, expand/collapse, active filter count, clear all, symbol debounce, side/status/strategy/confidence controls, active chips, and URL-backed filter updates retain their current behavior.
- [ ] Keyboard access, semantic labels, focus states, light/dark themes, and responsive layout remain intact or improve.
- [ ] Regression tests fail before implementation and pass afterward.
- [ ] Focused checks, the full test suite, and the production build pass.
- [ ] The change is committed with no generated output, secrets, or unrelated cleanup, and is not pushed.

## Constraints

- Follow `AGENTS.md`, use TDD, and keep the change surgical.
- Use existing shadcn primitives, Tailwind tokens, and repository styles. Do not add a dependency.
- Do not change filter data semantics, route search parameters, trade queries, pagination, or journal-entry card/table design.
- Do not use market-profit or loss colors decoratively.
- Do not edit generated `src/routeTree.gen.ts`.
- Do not fix unrelated pre-existing lint or type errors unless the FilterBar change itself makes a touched line fail.
- Do not create another task after this one.
