import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { AccountEntryKind, type AccountEntryRecord } from "@/lib/account-entry";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

const SKELETON_KEYS = ["entry-1", "entry-2", "entry-3", "entry-4"];

const KIND_LABELS: Record<AccountEntryKind, string> = {
	[AccountEntryKind.Deposit]: "Deposit",
	[AccountEntryKind.Withdrawal]: "Withdrawal",
	[AccountEntryKind.Adjustment]: "Adjustment",
};

function AccountEntriesSkeleton() {
	return (
		<ul className="divide-y divide-border">
			{SKELETON_KEYS.map((key) => (
				<li key={key} className="flex items-center justify-between gap-4 py-3">
					<div className="space-y-2">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-3 w-56" />
					</div>
					<Skeleton className="h-8 w-16" />
				</li>
			))}
		</ul>
	);
}

function AccountEntryItem({
	entry,
	isDeleting,
	onEdit,
	onDelete,
}: {
	entry: AccountEntryRecord;
	isDeleting: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const currency = useCurrency();
	const note = entry.note ? ` · ${entry.note}` : "";

	return (
		<li className="flex items-center justify-between gap-4 py-3">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<p
						className={cn(
							"font-data text-sm font-semibold",
							entry.amount >= 0 ? "text-success" : "text-destructive",
						)}
					>
						{formatMoney(entry.amount, currency, { signed: true })}
					</p>
					<span className="status-pill bg-muted text-muted-foreground">
						{KIND_LABELS[entry.kind]}
					</span>
				</div>
				<p className="mt-1 truncate text-xs text-muted-foreground">
					{`${format(new Date(entry.occurredAt), "dd MMM yyyy, HH:mm")}${note}`}
				</p>
			</div>
			<div className="flex shrink-0">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Edit entry"
					className="size-8 text-muted-foreground"
					onClick={onEdit}
				>
					<Pencil className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Delete entry"
					className="size-8 text-muted-foreground hover:text-destructive"
					disabled={isDeleting}
					onClick={onDelete}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
		</li>
	);
}

export function AccountEntryList({
	entries,
	isLoading,
	emptyLabel,
	isDeleting,
	onEdit,
	onDelete,
}: {
	entries: AccountEntryRecord[];
	isLoading: boolean;
	emptyLabel: string;
	isDeleting: boolean;
	onEdit: (entry: AccountEntryRecord) => void;
	onDelete: (id: number) => void;
}) {
	if (isLoading) return <AccountEntriesSkeleton />;
	if (entries.length === 0) {
		return (
			<div className="empty-field min-h-28 text-sm">
				No {emptyLabel} recorded.
			</div>
		);
	}
	return (
		<ul className="divide-y divide-border">
			{entries.map((entry) => (
				<AccountEntryItem
					key={entry.id}
					entry={entry}
					isDeleting={isDeleting}
					onEdit={() => onEdit(entry)}
					onDelete={() => onDelete(entry.id)}
				/>
			))}
		</ul>
	);
}
