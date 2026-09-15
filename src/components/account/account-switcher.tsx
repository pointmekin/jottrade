import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { AccountFormDialog } from "@/components/account/account-form-dialog";
import { AccountKindBadge } from "@/components/account/account-kind-badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/use-accounts";
import { ACCOUNT_KIND_LABELS } from "@/lib/account";
import { cn } from "@/lib/utils";

export function AccountSwitcher() {
	const { accounts, activeAccount, setActiveAccount, isLoading } =
		useAccounts();
	const { state } = useSidebar();
	const isCollapsed = state === "collapsed";
	const [createOpen, setCreateOpen] = useState(false);

	const initial = (activeAccount?.name.charAt(0) || "A").toUpperCase();

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							tooltip={activeAccount ? activeAccount.name : "Accounts"}
							className="h-11"
							disabled={isLoading && !activeAccount}
						>
							<div
								aria-hidden
								className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-accent font-data text-[11px] font-semibold"
							>
								{initial}
							</div>
							{!isCollapsed && (
								<>
									{isLoading && !activeAccount ? (
										<div className="min-w-0 flex-1 space-y-1">
											<Skeleton className="h-3 w-20" />
											<Skeleton className="h-2.5 w-12" />
										</div>
									) : (
										<div className="min-w-0 flex-1 text-left">
											<p className="truncate text-xs font-semibold">
												{activeAccount?.name ?? "No account"}
											</p>
											{activeAccount && (
												<p className="truncate text-[11px] text-muted-foreground">
													{ACCOUNT_KIND_LABELS[activeAccount.kind]} ·{" "}
													{activeAccount.currency}
												</p>
											)}
										</div>
									)}
									<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
								</>
							)}
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						side={isCollapsed ? "right" : "bottom"}
						align="start"
						className="min-w-56 rounded-md"
					>
						<DropdownMenuLabel className="text-xs text-muted-foreground">
							Trading accounts
						</DropdownMenuLabel>
						{accounts.map((account) => {
							const isActive = account.id === activeAccount?.id;
							return (
								<DropdownMenuItem
									key={account.id}
									onSelect={() => setActiveAccount(account.id)}
									className="gap-2"
								>
									<Check
										className={cn(
											"size-3.5 shrink-0",
											isActive ? "opacity-100" : "opacity-0",
										)}
									/>
									<span className="min-w-0 flex-1 truncate text-sm">
										{account.name}
									</span>
									<AccountKindBadge kind={account.kind} />
								</DropdownMenuItem>
							);
						})}
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => setCreateOpen(true)}>
							<Plus className="size-4" /> New account
						</DropdownMenuItem>
						<Link to="/settings">
							<DropdownMenuItem>
								<Settings className="size-4" /> Manage accounts
							</DropdownMenuItem>
						</Link>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>

			<AccountFormDialog open={createOpen} onOpenChange={setCreateOpen} />
		</SidebarMenu>
	);
}
