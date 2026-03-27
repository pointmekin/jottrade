import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { ChevronUp, LogOut, TrendingUp } from "lucide-react";

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

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => router.navigate({ to: "/sign-in" }),
			},
		});
	};

	const isActive = (url: string) =>
		location.pathname === url || location.pathname.startsWith(`${url}/`);

	return (
		<Sidebar>
			{/* Brand */}
			<div className="flex items-center gap-2.5 px-4 py-[18px] border-b border-zinc-800/60">
				<div className="h-7 w-7 rounded-md bg-indigo-500/90 flex items-center justify-center flex-shrink-0 shadow-sm shadow-indigo-500/30">
					<TrendingUp className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
				</div>
				<span className="font-semibold text-sm tracking-tight text-white">
					JotTrade
				</span>
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
													(
														session.data.user.name?.charAt(0) || "U"
													).toUpperCase()
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
