import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { Check, Crosshair, LogOut, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { AccountFormDialog } from "@/components/account/account-form-dialog";
import { AccountKindBadge } from "@/components/account/account-kind-badge";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useAccounts } from "@/hooks/use-accounts";
import { authClient } from "@/lib/auth-client";
import { navItems } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

const mobileItems = navItems.slice(0, 4);

export function BottomNav() {
	const location = useLocation();
	const router = useRouter();
	const session = authClient.useSession();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [accountFormOpen, setAccountFormOpen] = useState(false);
	const { accounts, activeAccount, setActiveAccount } = useAccounts();

	const isActive = (url: string) =>
		location.pathname === url || location.pathname.startsWith(`${url}/`);
	const handleSignOut = async () => {
		setSheetOpen(false);
		await authClient.signOut({
			fetchOptions: { onSuccess: () => router.navigate({ to: "/sign-in" }) },
		});
	};
	const userInitial = session.data?.user.name?.charAt(0).toUpperCase() ?? "U";

	return (
		<>
			<nav
				className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-sidebar lg:hidden"
				style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
			>
				{mobileItems.map((item, index) => (
					<Link
						key={item.title}
						to={item.url}
						className={cn(
							"relative flex min-h-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors",
							isActive(item.url) &&
								"bg-sidebar-accent text-sidebar-accent-foreground",
						)}
					>
						<span className="absolute left-1 top-1 font-data text-[7px] text-muted-foreground">
							{String(index + 1).padStart(2, "0")}
						</span>
						<item.icon className="size-4" />
						<span className="text-xs font-semibold">{item.title}</span>
					</Link>
				))}
				<button
					type="button"
					onClick={() => setSheetOpen(true)}
					aria-label="Open account and settings"
					className="relative flex min-h-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
				>
					<span className="absolute left-1 top-1 font-data text-[7px] text-muted-foreground">
						05
					</span>
					<div className="flex size-4 items-center justify-center border border-current font-data text-[7px]">
						{userInitial}
					</div>
					<span className="text-xs font-semibold">Account</span>
				</button>
			</nav>

			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent
					side="bottom"
					className="rounded-md border-border bg-sidebar text-sidebar-foreground"
				>
					<div className="mx-auto max-w-lg">
						<SheetHeader className="border-b border-border pb-4">
							<div className="flex items-center gap-3">
								<div className="flex size-10 items-center justify-center border border-border bg-sidebar-accent font-data text-xs">
									<Crosshair className="size-4" />
								</div>
								<div className="min-w-0 text-left">
									<SheetTitle className="truncate text-sm">
										{session.data?.user.name || "JotTrade account"}
									</SheetTitle>
									<p className="truncate text-xs text-muted-foreground">
										{session.data?.user.email}
									</p>
								</div>
							</div>
						</SheetHeader>
						<div className="border-b border-border py-3">
							<p className="field-label px-3 pb-2">Trading accounts</p>
							<div className="grid gap-1">
								{accounts.map((account) => {
									const isActive = account.id === activeAccount?.id;
									return (
										<button
											key={account.id}
											type="button"
											onClick={() => {
												setActiveAccount(account.id);
												setSheetOpen(false);
											}}
											className={cn(
												"flex items-center gap-3 border border-transparent px-3 py-2 text-left text-sm hover:border-border hover:bg-sidebar-accent",
												isActive && "border-border bg-sidebar-accent",
											)}
										>
											<span className="min-w-0 flex-1 truncate font-medium">
												{account.name}
											</span>
											<AccountKindBadge kind={account.kind} />
											{isActive && <Check className="size-4 shrink-0" />}
										</button>
									);
								})}
								<button
									type="button"
									onClick={() => {
										setSheetOpen(false);
										setAccountFormOpen(true);
									}}
									className="flex items-center gap-3 border border-transparent px-3 py-2 text-left text-sm text-muted-foreground hover:border-border hover:bg-sidebar-accent hover:text-foreground"
								>
									<Plus className="size-4" /> New account
								</button>
							</div>
						</div>
						<div className="grid gap-1 py-3">
							<Link
								to="/settings"
								onClick={() => setSheetOpen(false)}
								className="flex items-center gap-3 border border-transparent px-3 py-2 text-sm hover:border-border hover:bg-sidebar-accent"
							>
								<Settings className="size-4" /> Settings
							</Link>
							<Link
								to="/profile"
								onClick={() => setSheetOpen(false)}
								className="flex items-center gap-3 border border-transparent px-3 py-2 text-sm hover:border-border hover:bg-sidebar-accent"
							>
								<Crosshair className="size-4" /> Profile
							</Link>
						</div>
						<Separator />
						<div className="pt-3">
							<button
								type="button"
								onClick={handleSignOut}
								className="flex w-full items-center gap-3 border border-transparent px-3 py-2 text-sm text-destructive hover:border-destructive/40 hover:bg-destructive/10"
							>
								<LogOut className="size-4" /> Sign out
							</button>
						</div>
					</div>
				</SheetContent>
			</Sheet>
			<AccountFormDialog
				open={accountFormOpen}
				onOpenChange={setAccountFormOpen}
			/>
		</>
	);
}
