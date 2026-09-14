# Handoff: use mouse-down for sidebar navigation

## Task

Change the primary navigation links in `src/components/app-sidebar.tsx` to navigate on mouse-down instead of waiting for click, making desktop sidebar navigation feel more responsive.

Work on this task only. Read `AGENTS.md` in full, apply its required coding skills, inspect the sidebar and TanStack Router link behavior before editing, write regression tests before implementation, run proportional and full verification, and commit the result with a concise Conventional Commit message. Do not push.

When this task is complete, write a self-contained handoff document and create a new Codex task for "Redesign the journal FilterBar" from the committed branch or ref. The FilterBar task is the final item in this chain and must stop after committing and reporting completion; it must not create another task.

## Context

The original request contains six sequential changes, one per Codex task:

1. Correct equity and balance calculations. Completed.
2. Make trade dates aware of the user's local timezone. Completed.
3. Add delete trade entry functionality. Completed.
4. Fix the calendar journal-entry slider so it appears at desktop sizes as well as mobile. Completed in the commit immediately before this handoff.
5. Change navigation in `src/components/app-sidebar.tsx` to use mouse-down instead of click for a snappier response. This is your task.
6. Redesign `src/components/journal/FilterBar.tsx` so it is visually distinct from generic journal-entry cards.

Each task must implement and commit exactly one item. Tasks 1–5 also write a self-contained handoff under `docs/handoffs/` and create the next Codex task from their committed branch or ref. Task 6 stops after its commit and final report.

## Current state

The calendar-slider change now:

- Uses the existing Vaul `Drawer` for a selected trading day on both viewport classes.
- Keeps the current bottom-sheet behavior below the mobile breakpoint.
- Uses a constrained, full-height right-side panel on desktop.
- Preserves the selected date, trade count, net P&L, trade list, close callback, and `/journal/$tradeId` navigation.
- Adds desktop and mobile regression coverage in `src/test/day-trades-popover.test.tsx`.
- Passes all 56 tests and the production build.

Repository-wide Biome and `tsc --noEmit` still report pre-existing issues in unrelated files. Focused checks for the calendar-slider change pass.

## Relevant files

- `src/components/app-sidebar.tsx` renders the desktop sidebar. Both `mainItems` and `footerNavItems` currently use TanStack Router `Link` components with their default click navigation.
- `src/components/ui/sidebar.tsx` owns `SidebarMenuButton`; inspect its `asChild` behavior and event forwarding before changing the links.
- `src/lib/nav-items.ts` owns the shared navigation item definitions and must retain its current URLs/order.
- `src/test/nav-items.test.ts` currently covers only the navigation data, not interaction behavior. Add the smallest practical component-level regression coverage for mouse-down navigation and click deduplication/default behavior.
- `src/components/bottom-nav.tsx` is mobile navigation and is out of scope unless inspection proves the original request explicitly requires it. Do not change it speculatively.

## Acceptance criteria

- [ ] Pressing the primary mouse button down on a desktop sidebar navigation item starts exactly one navigation to that item's existing URL.
- [ ] The subsequent click does not trigger duplicate navigation.
- [ ] Modified or non-primary mouse interactions preserve expected link behavior and accessibility; keyboard activation still works.
- [ ] Active styling, icons, labels, tooltips, collapsed-sidebar behavior, account menu, profile link, sign-out, and mobile bottom navigation remain unchanged.
- [ ] Regression tests fail before the implementation and pass afterward.
- [ ] Focused tests/checks, the full suite, and the production build pass.
- [ ] The change is committed and the final FilterBar task is created from the new commit with a self-contained handoff.

## Constraints

- Follow `AGENTS.md` and apply `andrej-karpathy-skills:karpathy-guidelines` before coding.
- Use TDD and keep the change surgical.
- Reuse TanStack Router and existing sidebar primitives. Do not add a dependency.
- Do not weaken normal link semantics or keyboard accessibility merely to make pointer navigation earlier.
- Do not work on the FilterBar redesign in this task.
- Do not edit generated `src/routeTree.gen.ts`.
- Do not commit secrets, generated build output, or unrelated cleanup.
- Do not push.
