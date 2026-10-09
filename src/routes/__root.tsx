import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	ScriptOnce,
	Scripts,
	useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useState } from "react";
import { Toaster } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

const THEME_STORAGE_KEY = "vite-ui-theme";
const DEFAULT_THEME = "dark";

// Runs before hydration so the first paint already has the stored theme.
const themeScript = `(function () {
	try {
		var theme = localStorage.getItem("${THEME_STORAGE_KEY}") || "${DEFAULT_THEME}";
		if (theme === "system") {
			theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
		}
		document.documentElement.classList.add(theme);
	} catch (e) {}
})()`;

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
	const [commandsOpen, setCommandsOpen] = useState(false);

	const hideSidebarRoutes = [
		"/sign-in",
		"/sign-up",
		"/forgot-password",
		"/reset-password",
	];
	const shouldHideSidebar =
		location.pathname === "/" ||
		hideSidebarRoutes.some((route) => location.pathname.startsWith(route));

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
				<ScriptOnce>{themeScript}</ScriptOnce>
			</head>
			<body className="bg-background antialiased">
				<SidebarProvider>
					{!shouldHideSidebar && (
						<>
							{/* Desktop project index */}
							<div className="hidden lg:block">
								<AppSidebar onOpenCommands={() => setCommandsOpen(true)} />
							</div>
							<BottomNav onOpenCommands={() => setCommandsOpen(true)} />
						</>
					)}
					<ThemeProvider
						defaultTheme={DEFAULT_THEME}
						storageKey={THEME_STORAGE_KEY}
					>
						{!shouldHideSidebar && (
							<CommandPalette
								open={commandsOpen}
								onOpenChange={setCommandsOpen}
							/>
						)}
						<div
							className={cn(
								"w-full min-w-0 transform-gpu",
								!shouldHideSidebar && "pb-16 lg:pb-0",
							)}
						>
							{children}
						</div>
					</ThemeProvider>
				</SidebarProvider>
				<Toaster richColors closeButton />
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
