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
