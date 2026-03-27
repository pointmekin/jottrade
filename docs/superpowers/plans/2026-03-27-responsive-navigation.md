# Responsive Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a sidebar on desktop (≥ 1024px / `lg`) and a fixed bottom navigation bar on mobile/tablet (`< lg`), with a user avatar sheet on mobile.

**Architecture:** Extract nav item config to a shared module. Hide the existing sidebar below `lg` via a wrapper div. Add a new `BottomNav` component that shows only below `lg`. Wire both into `__root.tsx` alongside the existing `SidebarProvider`.

**Tech Stack:** React 19, TanStack Router v1 (`useLocation`, `Link`), shadcn/ui (`Sheet`), Tailwind CSS v4, Lucide React, BetterAuth (`authClient.useSession`).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/nav-items.ts` | **Create** | Single source of truth for all 5 nav items |
| `src/test/nav-items.test.ts` | **Create** | Unit test for nav items config |
| `src/components/bottom-nav.tsx` | **Create** | Mobile fixed bottom navigation bar + user avatar sheet |
| `src/components/app-sidebar.tsx` | **Modify** | Import from shared config instead of local arrays |
| `src/routes/__root.tsx` | **Modify** | Hide sidebar/trigger below `lg`, render `<BottomNav />`, add `pb-16 lg:pb-0` |

---

## Task 1: Shared Nav Items Config

**Files:**
- Create: `src/lib/nav-items.ts`
- Create: `src/test/nav-items.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/nav-items.test.ts
import { describe, it, expect } from 'vitest';
import { navItems } from '../lib/nav-items';

describe('navItems', () => {
  it('exports 5 items', () => {
    expect(navItems).toHaveLength(5);
  });

  it('has the correct urls', () => {
    const urls = navItems.map((i) => i.url);
    expect(urls).toEqual([
      '/dashboard',
      '/journal',
      '/calendar',
      '/strategies',
      '/settings',
    ]);
  });

  it('has title and icon on every item', () => {
    for (const item of navItems) {
      expect(typeof item.title).toBe('string');
      expect(typeof item.icon).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- nav-items
```

Expected: FAIL with "Cannot find module '../lib/nav-items'"

- [ ] **Step 3: Create the shared config**

```ts
// src/lib/nav-items.ts
import {
  BarChart2,
  CalendarDays,
  Settings,
  Target,
  ScrollText,
} from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const navItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart2 },
  { title: "Journal",   url: "/journal",   icon: ScrollText },
  { title: "Calendar",  url: "/calendar",  icon: CalendarDays },
  { title: "Strategies",url: "/strategies",icon: Target },
  { title: "Settings",  url: "/settings",  icon: Settings },
];
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test -- nav-items
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav-items.ts src/test/nav-items.test.ts
git commit -m "feat: extract shared nav items config"
```

---

## Task 2: Update App Sidebar to Use Shared Config

**Files:**
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Replace the local items arrays with the shared import**

Replace the top of `app-sidebar.tsx`. The full updated file:

```tsx
import {
  ChevronUp,
  LogOut,
  TrendingUp,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link, useRouter, useLocation } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "./ui/separator";
import { Spinner } from "./ui/spinner";
import { navItems } from "@/lib/nav-items";

// First 4 items go in the main menu; Settings (index 4) goes in the footer
const mainItems = navItems.slice(0, 4);
const footerNavItems = navItems.slice(4);

export function AppSidebar() {
  const session = authClient.useSession();
  const router = useRouter();
  const location = useLocation();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.navigate({ to: "/sign-in" }),
      },
    });
  };

  const isActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(url + "/");

  return (
    <Sidebar>
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-[18px] border-b border-zinc-800/60">
        <div className="h-7 w-7 rounded-md bg-indigo-500/90 flex items-center justify-center flex-shrink-0 shadow-sm shadow-indigo-500/30">
          <TrendingUp className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </div>
        <span className="font-semibold text-sm tracking-tight text-white">JotTrade</span>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {footerNavItems.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={isActive(item.url)}>
              <Link to={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}

        <Separator className="my-1 bg-zinc-800/60" />

        <div className="min-h-[64px] flex items-center">
          {session.isPending && (
            <div className="flex items-center justify-center w-full py-4">
              <Spinner />
            </div>
          )}
          {!session.isPending && session.data && (
            <SidebarMenu className="w-full">
              <SidebarMenuItem className="w-full">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild className="w-full min-w-0">
                    <SidebarMenuButton className="h-14 gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center font-semibold text-white text-xs flex-shrink-0 shadow-sm">
                        {session.data.user.image ? (
                          <img
                            src={session.data.user.image}
                            alt={session.data.user.name || "User"}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          (session.data.user.name?.charAt(0) || "U").toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">
                          {session.data.user.name}
                        </p>
                        <p className="text-xs text-zinc-500 truncate leading-tight mt-0.5">
                          {session.data.user.email}
                        </p>
                      </div>
                      <ChevronUp className="ml-auto h-4 w-4 text-zinc-500 flex-shrink-0" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    className="w-[--radix-dropdown-menu-trigger-width] min-w-52"
                  >
                    <Link to="/profile">
                      <DropdownMenuItem className="cursor-pointer">
                        Profile
                      </DropdownMenuItem>
                    </Link>
                    <Separator className="my-1" />
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="text-red-400 focus:text-red-400 cursor-pointer gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Run linter to confirm no errors**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "refactor: app-sidebar uses shared nav-items config"
```

---

## Task 3: Create Bottom Navigation Bar

**Files:**
- Create: `src/components/bottom-nav.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/bottom-nav.tsx
import { LogOut } from "lucide-react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { navItems } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export function BottomNav() {
  const location = useLocation();
  const router = useRouter();
  const session = authClient.useSession();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(url + "/");

  const handleSignOut = async () => {
    setSheetOpen(false);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.navigate({ to: "/sign-in" }),
      },
    });
  };

  const userInitial = session.data?.user.name?.charAt(0).toUpperCase() ?? "U";
  const userImage = session.data?.user.image;

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex lg:hidden border-t border-zinc-800/60 bg-sidebar"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {navItems.map((item) => (
          <Link
            key={item.title}
            to={item.url}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors",
              isActive(item.url)
                ? "text-sidebar-primary"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] leading-none">{item.title}</span>
          </Link>
        ))}

        {/* User avatar — opens account sheet */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <div className="h-5 w-5 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white overflow-hidden flex-shrink-0">
            {userImage ? (
              <img
                src={userImage}
                alt={session.data?.user.name ?? "User"}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[8px] font-semibold">{userInitial}</span>
            )}
          </div>
          <span className="text-[10px] leading-none">Account</span>
        </button>
      </nav>

      {/* Account sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="bg-sidebar text-sidebar-foreground border-zinc-800/60 pb-safe">
          <SheetHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white overflow-hidden flex-shrink-0">
                {userImage ? (
                  <img
                    src={userImage}
                    alt={session.data?.user.name ?? "User"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold">{userInitial}</span>
                )}
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-sm font-medium truncate">
                  {session.data?.user.name}
                </SheetTitle>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {session.data?.user.email}
                </p>
              </div>
            </div>
          </SheetHeader>

          <Separator className="bg-zinc-800/60" />

          <div className="flex flex-col gap-1 p-2">
            <Link
              to="/profile"
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent transition-colors"
            >
              Profile
            </Link>
          </div>

          <Separator className="bg-zinc-800/60" />

          <div className="p-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-sm text-red-400 hover:bg-sidebar-accent transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 2: Run linter**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/bottom-nav.tsx
git commit -m "feat: add BottomNav component for mobile navigation"
```

---

## Task 4: Wire Into Root Layout

**Files:**
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Update the root layout**

Replace `src/routes/__root.tsx` with:

```tsx
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeProvider } from "@/components/theme-provider";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "JotTrade" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const hideSidebarRoutes = ["/sign-in", "/sign-up"];
  const shouldHideSidebar = hideSidebarRoutes.some((route) =>
    location.pathname.startsWith(route)
  );

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var storageKey = "vite-ui-theme";
                var defaultTheme = "dark";
                try {
                  var theme = localStorage.getItem(storageKey);
                  var support = window.matchMedia("(prefers-color-scheme: dark)").matches === true;
                  if (!theme && defaultTheme === "system") {
                    document.documentElement.classList.add(support ? "dark" : "light");
                  } else if (!theme) {
                     document.documentElement.classList.add(defaultTheme);
                  } else if (theme === "system") {
                    document.documentElement.classList.add(support ? "dark" : "light");
                  } else {
                    document.documentElement.classList.add(theme);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background">
        <SidebarProvider>
          {!shouldHideSidebar && (
            <>
              {/* Desktop sidebar — hidden below lg */}
              <div className="hidden lg:block">
                <AppSidebar />
              </div>
              {/* Sidebar collapse trigger — desktop only */}
              <div className="hidden lg:flex">
                <SidebarTrigger />
              </div>
              {/* Mobile bottom nav — hidden at lg and above */}
              <BottomNav />
            </>
          )}
          <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            {/* pb-16 reserves space above the fixed bottom nav on mobile */}
            <div className="w-full pb-16 lg:pb-0">{children}</div>
          </ThemeProvider>
        </SidebarProvider>
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            { name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Run linter**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 3: Run the dev server and verify visually**

```bash
npm run dev
```

Verify:
- At viewport ≥ 1024px: sidebar is visible, no bottom nav, SidebarTrigger collapses sidebar
- At viewport < 1024px: sidebar is gone, bottom nav appears with 5 nav items + Account button
- Active item highlights in indigo on both sidebar and bottom nav
- Tapping Account opens a bottom sheet with user name, email, Profile link, Sign Out
- Sign out works on mobile sheet
- Sign-in and sign-up pages show neither sidebar nor bottom nav

- [ ] **Step 4: Run tests**

```bash
npm run test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat: responsive navigation — sidebar on desktop, bottom nav on mobile"
```
