import { Link, useLocation, useRouter } from "@tanstack/react-router";
import {
	ChevronUp,
	Crosshair,
	LogOut,
	PanelLeft,
	PanelLeftClose,
} from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { AccountSwitcher } from "@/components/account/account-switcher";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { navItems } from "@/lib/nav-items";
import { authClient } from "../lib/auth-client";
import { Separator } from "./ui/separator";
import { Spinner } from "./ui/spinner";

const mainItems = navItems.slice(0, 4);
const footerNavItems = navItems.slice(4);

function isPlainPrimaryMouseEvent(event: ReactMouseEvent<HTMLAnchorElement>) {
	const target = event.currentTarget.getAttribute("target");
	return (
		event.button === 0 &&
		!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) &&
		!event.defaultPrevented &&
		(!target || target === "_self")
	);
}

export function AppSidebar() {
	const session = authClient.useSession();
	const router = useRouter();
	const location = useLocation();
	const { state, toggleSidebar } = useSidebar();
	const isCollapsed = state === "collapsed";

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: { onSuccess: () => router.navigate({ to: "/sign-in" }) },
		});
	};

	const isActive = (url: string) =>
		location.pathname === url || location.pathname.startsWith(`${url}/`);

	const getMouseDownNavigationProps = (url: string) => ({
		onMouseDown: (event: ReactMouseEvent<HTMLAnchorElement>) => {
			if (isPlainPrimaryMouseEvent(event)) {
				router.navigate({ to: url });
			}
		},
		onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => {
			if (event.detail > 0 && isPlainPrimaryMouseEvent(event)) {
				event.preventDefault();
			}
		},
	});

	return (
		<Sidebar collapsible="icon" className="border-r border-sidebar-border">
			<div className="border-b border-sidebar-border">
				<div className="flex h-14 items-center justify-center gap-2 px-2">
					{!isCollapsed && (
						<>
							<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
								<Crosshair className="size-4" strokeWidth={2} />
							</div>
							<p className="min-w-0 flex-1 truncate text-sm font-semibold">
								JotTrade
							</p>
						</>
					)}
					<button
						type="button"
						onClick={toggleSidebar}
						aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
						className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
					>
						{isCollapsed ? (
							<PanelLeft className="size-4" />
						) : (
							<PanelLeftClose className="size-4" />
						)}
					</button>
				</div>
			</div>

			<SidebarContent>
				<SidebarGroup className="px-2 pt-3">
					<SidebarGroupContent>
						<AccountSwitcher />
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup className="px-2 pt-1">
					<SidebarGroupContent>
						<SidebarMenu className="gap-1">
							{mainItems.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={isActive(item.url)}
										tooltip={item.title}
										className="h-9 font-medium"
									>
										<Link
											to={item.url}
											{...getMouseDownNavigationProps(item.url)}
										>
											<item.icon className="size-4" />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className="gap-2 border-t border-sidebar-border p-2">
				<SidebarMenu>
					{footerNavItems.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								asChild
								isActive={isActive(item.url)}
								tooltip={item.title}
								className="h-9"
							>
								<Link to={item.url} {...getMouseDownNavigationProps(item.url)}>
									<item.icon className="size-4" />
									<span>{item.title}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
				<Separator />
				{session.isPending && (
					<div className="flex h-12 items-center justify-center">
						<Spinner />
					</div>
				)}
				{!session.isPending && session.data && (
					<SidebarMenu>
						<SidebarMenuItem>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<SidebarMenuButton
										tooltip={session.data.user.name || "Account"}
										className="h-12"
									>
										<div className="flex size-3.5 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold">
											{(session.data.user.name?.charAt(0) || "U").toUpperCase()}
										</div>
										{!isCollapsed && (
											<>
												<div className="min-w-0 flex-1">
													<p className="truncate text-xs font-semibold">
														{session.data.user.name}
													</p>
													<p className="truncate text-xs text-muted-foreground">
														{session.data.user.email}
													</p>
												</div>
												<ChevronUp className="size-3.5 text-muted-foreground" />
											</>
										)}
									</SidebarMenuButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent side="top" className="min-w-52 rounded-sm">
									<Link to="/profile">
										<DropdownMenuItem>Profile</DropdownMenuItem>
									</Link>
									<Separator className="my-1" />
									<DropdownMenuItem
										onClick={handleSignOut}
										className="gap-2 text-destructive focus:text-destructive"
									>
										<LogOut className="size-4" /> Sign out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</SidebarMenuItem>
					</SidebarMenu>
				)}
			</SidebarFooter>
		</Sidebar>
	);
}
