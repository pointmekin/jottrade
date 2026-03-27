# Responsive Navigation Design

**Date:** 2026-03-27
**Status:** Approved

## Overview

Update JotTrade navigation to be fully responsive: sidebar on desktop (`≥ lg / 1024px`), bottom navigation bar on mobile/tablet (`< lg`).

## Breakpoint

- **`lg` (1024px)**: threshold between sidebar and bottom nav
- Below `lg` → bottom nav visible, sidebar hidden
- At/above `lg` → sidebar visible, bottom nav hidden

## Architecture

### New Files

- `src/components/bottom-nav.tsx` — mobile bottom navigation bar component
- `src/lib/nav-items.ts` — shared nav item config (extracted from `app-sidebar.tsx`)

### Modified Files

- `src/components/app-sidebar.tsx` — import nav items from shared config; hide below `lg`
- `src/routes/__root.tsx` — render `<BottomNav />` alongside sidebar; hide `SidebarTrigger` on mobile; add bottom padding to content wrapper

## Components

### `src/lib/nav-items.ts`

Exports the shared nav items array so both sidebar and bottom nav reference the same source:

```ts
export const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart2 },
  { title: "Journal", url: "/journal", icon: ScrollText },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Strategies", url: "/strategies", icon: Target },
  { title: "Settings", url: "/settings", icon: Settings },
]
```

### `src/components/bottom-nav.tsx`

- Fixed bar pinned to `bottom-0`, full width, `z-50`
- Background: `--sidebar` CSS token (dark zinc, matches sidebar)
- Top border: `border-zinc-800/60`
- Safe area: `padding-bottom: env(safe-area-inset-bottom)` for iPhone home indicator
- 5 nav items evenly distributed (`flex-1` each): icon stacked above label
- Active state: indigo (`sidebar-primary` token) on icon + label; inactive: `zinc-400`
- No background pill on active — color-only, consistent with sidebar style
- Uses `useLocation` from TanStack Router for active detection (same `isActive` logic as sidebar)

**User avatar button:**
- Circular avatar (indigo gradient initials or profile image) positioned in the bar or as a floating element above it
- On tap: opens shadcn `Sheet` (slides up from bottom) containing:
  - User name + email
  - "Profile" link
  - Separator
  - "Sign Out" (red, with `LogOut` icon)

### `src/components/app-sidebar.tsx`

- Import nav items from `src/lib/nav-items.ts`
- Remove Settings from `footerItems` (now in shared `navItems`)
- The `<Sidebar>` component renders inside a `hidden lg:block` wrapper div so it vanishes below `lg`

### `src/routes/__root.tsx`

- `<SidebarTrigger>` gets `className="hidden lg:flex"` — hidden on mobile
- `<BottomNav />` added inside `SidebarProvider`, same `!shouldHideSidebar` guard as sidebar
- Content wrapper: `className="w-full pb-16 lg:pb-0"` — reserves space below content on mobile

## Behaviour

| Screen | Sidebar | Bottom Nav | SidebarTrigger |
|--------|---------|------------|----------------|
| `< lg` | hidden  | visible    | hidden         |
| `≥ lg` | visible | hidden     | visible        |

## Not In Scope

- Animated transition between sidebar/bottom nav (pure CSS show/hide)
- Tablet-specific mid-state (e.g., icon-only collapsed sidebar at `md`)
- Push/overlay sidebar behavior on mobile
