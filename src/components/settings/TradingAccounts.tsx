import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AccountFormDialog } from "@/components/account/account-form-dialog";
import { AccountKindBadge } from "@/components/account/account-kind-badge";
import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { SectionHeading } from "@/components/app-page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/use-accounts";
import type { AccountRecord } from "@/server/portfolioActions";

const SKELETON_KEYS = ["account-1", "account-2", "account-3"];

export function TradingAccounts() {
	const { accounts, activeAccount, isLoading } = useAccounts();
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<AccountRecord | null>(null);
	const [deleting, setDeleting] = useState<AccountRecord | null>(null);

	return (
		<div className="surface space-y-4 p-5">
			<SectionHeading
				title="Trading accounts"
				detail="Each account keeps its own trades, cash flows, and analytics."
				actions={
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setEditing(null);
							setFormOpen(true);
						}}
					>
						<Plus className="size-4" />
						Add account
					</Button>
				}
			/>

			{isLoading ? (
				<ul className="divide-y divide-border">
					{SKELETON_KEYS.map((key) => (
						<li
							key={key}
							className="flex items-center justify-between gap-4 py-3"
						>
							<div className="min-w-0 flex-1 space-y-1.5">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-48" />
							</div>
							<Skeleton className="h-8 w-20" />
						</li>
					))}
				</ul>
			) : (
				<ul className="divide-y divide-border">
					{accounts.map((account) => (
						<li
							key={account.id}
							className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
						>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<p className="truncate text-sm font-medium">{account.name}</p>
									<AccountKindBadge kind={account.kind} />
									{account.isDefault && (
										<span className="status-pill border-border bg-muted text-muted-foreground">
											Default
										</span>
									)}
									{activeAccount?.id === account.id && (
										<span className="status-pill border-primary/35 bg-primary/10 text-primary">
											Active
										</span>
									)}
								</div>
								{account.description && (
									<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
										{account.description}
									</p>
								)}
								<p className="field-label mt-0.5">
									{account.currency} ·{" "}
									{account.tradeCount === 1
										? "1 trade"
										: `${account.tradeCount} trades`}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="size-8"
									aria-label={`Edit ${account.name}`}
									onClick={() => {
										setEditing(account);
										setFormOpen(true);
									}}
								>
									<Pencil className="size-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-destructive hover:text-destructive"
									aria-label={`Delete ${account.name}`}
									onClick={() => setDeleting(account)}
								>
									<Trash2 className="size-3.5" />
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			<AccountFormDialog
				open={formOpen}
				onOpenChange={setFormOpen}
				account={editing}
			/>
			<DeleteAccountDialog
				account={deleting}
				onOpenChange={(next) => {
					if (!next) setDeleting(null);
				}}
			/>
		</div>
	);
}
