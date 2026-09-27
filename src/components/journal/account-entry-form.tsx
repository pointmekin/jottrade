import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import { AccountEntryKind, type AccountEntryRecord } from "@/lib/account-entry";
import { localDateTimeToIso, toDateTimeLocalValue } from "@/lib/date";
import { invalidateAccountEntryQueries } from "@/lib/query-keys";
import { addCashFlow, updateCashFlow } from "@/server/cashFlowActions";

type EntryInput = {
	occurredAt: string;
	amount: number;
	kind: AccountEntryKind;
	note?: string;
};

const errorMessage = (cause: unknown, fallback: string) =>
	cause instanceof Error ? cause.message : fallback;

function initialDraft(isAdjustment: boolean, entry: AccountEntryRecord | null) {
	const defaultKind = isAdjustment
		? AccountEntryKind.Adjustment
		: AccountEntryKind.Deposit;
	if (!entry) {
		return {
			kind: defaultKind,
			amount: "",
			occurredAt: toDateTimeLocalValue(new Date()),
			note: "",
		};
	}
	return {
		kind: entry.kind,
		amount: String(isAdjustment ? entry.amount : Math.abs(entry.amount)),
		occurredAt: toDateTimeLocalValue(new Date(entry.occurredAt)),
		note: entry.note ?? "",
	};
}

function amountError(isAdjustment: boolean, amount: number): string | null {
	if (!Number.isFinite(amount) || amount === 0 || (!isAdjustment && amount < 0))
		return isAdjustment
			? "Enter a non-zero amount. Use a minus sign for a charge."
			: "Enter an amount above zero.";
	return null;
}

function useSaveAccountEntry(editingId: number | null, onSaved: () => void) {
	const queryClient = useQueryClient();
	const { activeAccount } = useAccounts();
	return useMutation({
		mutationFn: (input: EntryInput) => {
			if (!activeAccount) {
				return Promise.reject(new Error("No active account."));
			}
			return editingId
				? updateCashFlow({ data: { ...input, id: editingId } })
				: addCashFlow({ data: { ...input, portfolioId: activeAccount.id } });
		},
		onSuccess: () => {
			invalidateAccountEntryQueries(queryClient);
			toast.success(
				editingId ? "Account entry updated" : "Account entry added",
			);
			onSaved();
		},
	});
}

function submitLabel(isPending: boolean, isEditing: boolean) {
	if (isPending) return "Saving…";
	return isEditing ? "Save" : "Add";
}

/** Remount with a new `key` to start editing another entry. */
export function AccountEntryForm({
	isAdjustment,
	editing,
	onDone,
}: {
	isAdjustment: boolean;
	editing: AccountEntryRecord | null;
	onDone: () => void;
}) {
	const currency = useCurrency();
	const id = useId();
	const [draft, setDraft] = useState(() => initialDraft(isAdjustment, editing));
	const [error, setError] = useState<string | null>(null);
	const save = useSaveAccountEntry(editing?.id ?? null, onDone);
	const patch = (next: Partial<typeof draft>) =>
		setDraft({ ...draft, ...next });

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const amount = Number(draft.amount);
		const invalid = amountError(isAdjustment, amount);
		if (invalid) {
			setError(invalid);
			return;
		}
		save.mutate(
			{
				occurredAt: localDateTimeToIso(draft.occurredAt),
				amount:
					draft.kind === AccountEntryKind.Withdrawal
						? -Math.abs(amount)
						: amount,
				kind: draft.kind,
				note: draft.note.trim() || undefined,
			},
			{
				onError: (cause) =>
					setError(errorMessage(cause, "The entry could not be saved.")),
			},
		);
	};

	return (
		<>
			<form
				onSubmit={submit}
				className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[auto_1fr_1.2fr_1.2fr_auto] sm:items-end"
			>
				{!isAdjustment && (
					<div className="grid gap-2">
						<Label htmlFor={`${id}-kind`}>Type</Label>
						<Select
							value={draft.kind}
							onValueChange={(kind) =>
								patch({ kind: kind as AccountEntryKind })
							}
						>
							<SelectTrigger id={`${id}-kind`} className="h-9 w-36">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={AccountEntryKind.Deposit}>
									Deposit
								</SelectItem>
								<SelectItem value={AccountEntryKind.Withdrawal}>
									Withdrawal
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}
				<div className="grid gap-2">
					<Label htmlFor={`${id}-amount`}>Amount ({currency})</Label>
					<Input
						id={`${id}-amount`}
						type="number"
						step="0.01"
						min={isAdjustment ? undefined : "0.01"}
						placeholder={isAdjustment ? "-4.50" : "1000.00"}
						value={draft.amount}
						onChange={(event) => patch({ amount: event.target.value })}
						className="h-9 font-data"
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor={`${id}-date`}>Date and time</Label>
					<Input
						id={`${id}-date`}
						type="datetime-local"
						value={draft.occurredAt}
						onChange={(event) => patch({ occurredAt: event.target.value })}
						className="h-9"
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor={`${id}-note`}>Note</Label>
					<Input
						id={`${id}-note`}
						value={draft.note}
						maxLength={280}
						placeholder={
							isAdjustment ? "Exness overnight fee" : "Bank transfer"
						}
						onChange={(event) => patch({ note: event.target.value })}
						className="h-9"
					/>
				</div>
				<div className="flex gap-1">
					{editing && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="Cancel editing"
							onClick={onDone}
						>
							<X className="size-4" />
						</Button>
					)}
					<Button type="submit" className="h-9" disabled={save.isPending}>
						{submitLabel(save.isPending, editing !== null)}
					</Button>
				</div>
			</form>
			{error && <p className="text-sm text-destructive">{error}</p>}
		</>
	);
}
