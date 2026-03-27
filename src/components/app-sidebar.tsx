import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { ChevronUp, LogOut, PanelLeft, PanelLeftClose, TrendingUp } from "lucide-react";

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

// First 4 items go in the main menu; Settings (index 4) goes in the footer
const mainItems = navItems.slice(0, 4);
const footerNavItems = navItems.slice(4);

export function AppSidebar() {
	const session = authClient.useSession();
	const router = useRouter();
	const location = useLocation();
	const { state, toggleSidebar } = useSidebar();

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => router.navigate({ to: "/sign-in" }),
			},
		});
	};

	const isActive = (url: string) =>
		location.pathname === url || location.pathname.startsWith(`${url}/`);

	const isCollapsed = state === "collapsed";

	return (
		<Sidebar collapsible="icon">
			{/* Brand + Toggle */}
			<div
				className={
					isCollapsed
						? "flex items-center justify-center py-[18px] border-b border-border"
						: "flex items-center gap-2.5 px-3 py-[18px] border-b border-border"
				}
			>
				{!isCollapsed && (
					<>
						<div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0 shadow-sm shadow-primary/30">
							<TrendingUp
								className="h-3.5 w-3.5 text-primary-foreground"
								strokeWidth={2.5}
							/>
						</div>
						<span className="font-semibold text-sm tracking-tight text-foreground flex-1">
							JotTrade
						</span>
					</>
				)}
				<button
					type="button"
					onClick={toggleSidebar}
					aria-label="Toggle sidebar"
					className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors flex-shrink-0"
				>
					{isCollapsed ? (
						<PanelLeft className="h-4 w-4" />
					) : (
						<PanelLeftClose className="h-4 w-4" />
					)}
				</button>
			</div>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent className="mt-2">
						<SidebarMenu>
							{mainItems.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={isActive(item.url)}
										tooltip={item.title}
									>
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
						<SidebarMenuButton
							asChild
							isActive={isActive(item.url)}
							tooltip={item.title}
						>
							<Link to={item.url}>
								<item.icon />
								<span>{item.title}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}

				<Separator className="my-1" />

				<div className="min-h-[40px] flex items-center">
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
										<SidebarMenuButton
											tooltip={session.data.user.name || "Account"}
											className={isCollapsed ? "h-8 p-0 justify-center" : "h-14 gap-3"}
										>
											<div className="h-6 w-6 rounded-full bg-gradient-to-tr from-blue-500 to-violet-500 flex items-center justify-center font-semibold text-white text-[10px] flex-shrink-0 shadow-sm">
												{session.data.user.image ? (
													<img
														src={session.data.user.image}
														alt={session.data.user.name || "User"}
														className="w-6 h-6 rounded-full object-cover"
													/>
												) : (
													(
														session.data.user.name?.charAt(0) || "U"
													).toUpperCase()
												)}
											</div>
											{!isCollapsed && (
												<>
													<div className="flex-1 min-w-0">
														<p className="text-sm font-medium truncate leading-tight">
															{session.data.user.name}
														</p>
														<p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
															{session.data.user.email}
														</p>
													</div>
													<ChevronUp className="ml-auto h-4 w-4 text-muted-foreground flex-shrink-0" />
												</>
											)}
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
