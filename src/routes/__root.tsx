import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

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
		location.pathname.startsWith(route),
	);

	return (
		<html lang="en">
			<head>
				<HeadContent />
				{/* This script:
            Runs immediately when the page loads, before React hydrates.
            Reads the user's theme preference from localStorage.
            Applies the correct dark or light class to the document.documentElement (<html> tag) instantly.
            This ensures that by the time the browser paints the page, the correct theme is already applied, preventing the white flash. */}
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
	{/* Mobile bottom nav — hidden at lg and above */}
							<BottomNav />
						</>
					)}
					<ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
						{/* pb-16 reserves space above the fixed bottom nav on mobile */}
						<div
							className={cn("w-full", !shouldHideSidebar && "pb-16 lg:pb-0")}
						>
							{children}
						</div>
					</ThemeProvider>
				</SidebarProvider>
				<TanStackDevtools
					config={{ position: "bottom-right" }}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
