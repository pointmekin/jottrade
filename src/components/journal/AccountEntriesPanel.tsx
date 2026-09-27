import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/app-page-header";
import { useAccountEntries } from "@/hooks/use-account-entries";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import { AccountEntryKind, type AccountEntryRecord } from "@/lib/account-entry";
import { formatMoney } from "@/lib/currency";
import { JournalView } from "@/lib/journal-search";
import { invalidateAccountEntryQueries } from "@/lib/query-keys";
import { deleteCashFlow } from "@/server/cashFlowActions";
import { AccountEntryForm } from "./account-entry-form";
import { AccountEntryList } from "./account-entry-list";

type PanelMode = typeof JournalView.Adjustments | typeof JournalView.Funding;

function useDeleteAccountEntry(onError: (message: string) => void) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deleteCashFlow({ data: { id } }),
		onSuccess: () => {
			invalidateAccountEntryQueries(queryClient);
			toast.success("Account entry deleted");
		},
		onError: (cause) =>
			onError(
				cause instanceof Error
					? cause.message
					: "The entry could not be deleted.",
			),
	});
}

export function AccountEntriesPanel({ mode }: { mode: PanelMode }) {
	const currency = useCurrency();
	const isAdjustment = mode === JournalView.Adjustments;
	const [editing, setEditing] = useState<AccountEntryRecord | null>(null);
	const [formKey, setFormKey] = useState(0);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const remove = useDeleteAccountEntry(setDeleteError);
	const { activeAccount } = useAccounts();
	const { data: entries = [], isLoading } = useAccountEntries(
		activeAccount?.id,
	);
	const visibleEntries = entries.filter(
		(entry) => (entry.kind === AccountEntryKind.Adjustment) === isAdjustment,
	);
	const netFunded = visibleEntries.reduce(
		(sum, entry) => sum + entry.amount,
		0,
	);
	const finishEditing = () => {
		setEditing(null);
		setFormKey((key) => key + 1);
	};

	return (
		<div className="surface space-y-5 p-5">
			<SectionHeading
				title={
					isAdjustment ? "Account adjustments" : "Deposits and withdrawals"
				}
				detail={
					isAdjustment
						? `${visibleEntries.length} entries`
						: `Net funded ${formatMoney(netFunded, currency)} ${currency}`
				}
			/>
			<p className="text-xs leading-5 text-muted-foreground">
				{isAdjustment
					? "Adjustments change account balance and net P&L without changing trade statistics. Use a negative amount for a charge and a positive amount for a credit."
					: "Funding changes account balance without being counted as trading profit or loss."}
			</p>
			<AccountEntryForm
				key={editing?.id ?? `new-${formKey}`}
				isAdjustment={isAdjustment}
				editing={editing}
				onDone={finishEditing}
			/>
			{deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
			<div className="border-t border-border pt-3">
				<AccountEntryList
					entries={visibleEntries}
					isLoading={isLoading}
					emptyLabel={isAdjustment ? "adjustments" : "funding entries"}
					isDeleting={remove.isPending}
					onEdit={setEditing}
					onDelete={(id) => remove.mutate(id)}
				/>
			</div>
		</div>
	);
}
