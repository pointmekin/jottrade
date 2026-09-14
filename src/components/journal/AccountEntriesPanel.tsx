import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Pencil, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/app-page-header";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountEntries } from "@/hooks/use-account-entries";
import { useCurrency } from "@/hooks/use-currency";
import { AccountEntryKind, type AccountEntryRecord } from "@/lib/account-entry";
import { formatMoney } from "@/lib/currency";
import { localDateTimeToIso, toDateTimeLocalValue } from "@/lib/date";
import {
	addCashFlow,
	deleteCashFlow,
	updateCashFlow,
} from "@/server/portfolioActions";

type PanelMode = "adjustments" | "funding";

const SKELETON_KEYS = ["entry-1", "entry-2", "entry-3", "entry-4"];

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

function kindLabel(kind: AccountEntryRecord["kind"]): string {
	if (kind === AccountEntryKind.Deposit) return "Deposit";
	if (kind === AccountEntryKind.Withdrawal) return "Withdrawal";
	return "Adjustment";
}

export function AccountEntriesPanel({ mode }: { mode: PanelMode }) {
	const queryClient = useQueryClient();
	const currency = useCurrency();
	const isAdjustment = mode === "adjustments";
	const [editingId, setEditingId] = useState<number | null>(null);
	const [kind, setKind] = useState<AccountEntryRecord["kind"]>(
		isAdjustment ? AccountEntryKind.Adjustment : AccountEntryKind.Deposit,
	);
	const [amount, setAmount] = useState("");
	const [occurredAt, setOccurredAt] = useState(
		toDateTimeLocalValue(new Date()),
	);
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);
	const amountId = useId();
	const dateId = useId();
	const noteId = useId();

	const { data: entries = [], isLoading } = useAccountEntries();
	const visibleEntries = entries.filter((entry) =>
		isAdjustment
			? entry.kind === AccountEntryKind.Adjustment
			: entry.kind !== AccountEntryKind.Adjustment,
	);

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["cash-flows"] });
		queryClient.invalidateQueries({ queryKey: ["analytics"] });
		queryClient.invalidateQueries({ queryKey: ["advanced-analytics"] });
	};

	const resetForm = () => {
		setEditingId(null);
		setKind(
			isAdjustment ? AccountEntryKind.Adjustment : AccountEntryKind.Deposit,
		);
		setAmount("");
		setOccurredAt(toDateTimeLocalValue(new Date()));
		setNote("");
		setError(null);
	};

	const saveMutation = useMutation({
		mutationFn: (input: {
			id?: number;
			occurredAt: string;
			amount: number;
			kind: AccountEntryRecord["kind"];
			note?: string;
		}) =>
			input.id
				? updateCashFlow({ data: { ...input, id: input.id } } as never)
				: addCashFlow({ data: input } as never),
		onSuccess: () => {
			invalidate();
			toast.success(
				editingId ? "Account entry updated" : "Account entry added",
			);
			resetForm();
		},
		onError: (cause) =>
			setError(
				cause instanceof Error
					? cause.message
					: "The entry could not be saved.",
			),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => deleteCashFlow({ data: { id } } as never),
		onSuccess: () => {
			invalidate();
			toast.success("Account entry deleted");
		},
		onError: (cause) =>
			setError(
				cause instanceof Error
					? cause.message
					: "The entry could not be deleted.",
			),
	});

	const edit = (entry: AccountEntryRecord) => {
		setEditingId(entry.id);
		setKind(entry.kind);
		setAmount(
			String(
				entry.kind === AccountEntryKind.Adjustment
					? entry.amount
					: Math.abs(entry.amount),
			),
		);
		setOccurredAt(toDateTimeLocalValue(new Date(entry.occurredAt)));
		setNote(entry.note ?? "");
		setError(null);
	};

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		const parsed = Number(amount);
		if (
			!Number.isFinite(parsed) ||
			parsed === 0 ||
			(!isAdjustment && parsed < 0)
		) {
			setError(
				isAdjustment
					? "Enter a non-zero amount. Use a minus sign for a charge."
					: "Enter an amount above zero.",
			);
			return;
		}

		const signedAmount =
			kind === AccountEntryKind.Withdrawal ? -Math.abs(parsed) : parsed;
		saveMutation.mutate({
			id: editingId ?? undefined,
			occurredAt: localDateTimeToIso(occurredAt),
			amount: signedAmount,
			kind,
			note: note.trim() || undefined,
		});
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
						: `Net funded ${formatMoney(
								visibleEntries.reduce((sum, entry) => sum + entry.amount, 0),
								currency,
							)} ${currency}`
				}
			/>
			<p className="text-xs leading-5 text-muted-foreground">
				{isAdjustment
					? "Adjustments change account balance and net P&L without changing trade statistics. Use a negative amount for a charge and a positive amount for a credit."
					: "Funding changes account balance without being counted as trading profit or loss."}
			</p>

			<form
				onSubmit={submit}
				className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[auto_1fr_1.2fr_1.2fr_auto] sm:items-end"
			>
				{!isAdjustment && (
					<div className="grid gap-2">
						<Label htmlFor={`${amountId}-kind`}>Type</Label>
						<Select
							value={kind}
							onValueChange={(value) =>
								setKind(value as AccountEntryRecord["kind"])
							}
						>
							<SelectTrigger id={`${amountId}-kind`} className="h-9 w-36">
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
					<Label htmlFor={amountId}>Amount ({currency})</Label>
					<Input
						id={amountId}
						type="number"
						step="0.01"
						min={isAdjustment ? undefined : "0.01"}
						placeholder={isAdjustment ? "-4.50" : "1000.00"}
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						className="h-9 font-data"
					/>
				</div>

				<div className="grid gap-2">
					<Label htmlFor={dateId}>Date and time</Label>
					<Input
						id={dateId}
						type="datetime-local"
						value={occurredAt}
						onChange={(event) => setOccurredAt(event.target.value)}
						className="h-9"
					/>
				</div>

				<div className="grid gap-2">
					<Label htmlFor={noteId}>Note</Label>
					<Input
						id={noteId}
						value={note}
						maxLength={280}
						placeholder={
							isAdjustment ? "Exness overnight fee" : "Bank transfer"
						}
						onChange={(event) => setNote(event.target.value)}
						className="h-9"
					/>
				</div>

				<div className="flex gap-1">
					{editingId && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="Cancel editing"
							onClick={resetForm}
						>
							<X className="size-4" />
						</Button>
					)}
					<Button
						type="submit"
						className="h-9"
						disabled={saveMutation.isPending}
					>
						{saveMutation.isPending ? "Saving…" : editingId ? "Save" : "Add"}
					</Button>
				</div>
			</form>

			{error && <p className="text-sm text-destructive">{error}</p>}

			<div className="border-t border-border pt-3">
				{isLoading && <AccountEntriesSkeleton />}
				{!isLoading && visibleEntries.length === 0 && (
					<div className="empty-field min-h-28 text-sm">
						No {isAdjustment ? "adjustments" : "funding entries"} recorded.
					</div>
				)}
				{visibleEntries.length > 0 && (
					<ul className="divide-y divide-border">
						{visibleEntries.map((entry) => (
							<li
								key={entry.id}
								className="flex items-center justify-between gap-4 py-3"
							>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p
											className={`font-data text-sm font-semibold ${entry.amount >= 0 ? "text-success" : "text-destructive"}`}
										>
											{formatMoney(entry.amount, currency, { signed: true })}
										</p>
										<span className="status-pill bg-muted text-muted-foreground">
											{kindLabel(entry.kind)}
										</span>
									</div>
									<p className="mt-1 truncate text-xs text-muted-foreground">
										{format(new Date(entry.occurredAt), "dd MMM yyyy, HH:mm")}
										{entry.note && ` · ${entry.note}`}
									</p>
								</div>
								<div className="flex shrink-0">
									<Button
										variant="ghost"
										size="icon"
										aria-label="Edit entry"
										className="size-8 text-muted-foreground"
										onClick={() => edit(entry)}
									>
										<Pencil className="size-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										aria-label="Delete entry"
										className="size-8 text-muted-foreground hover:text-destructive"
										disabled={deleteMutation.isPending}
										onClick={() => deleteMutation.mutate(entry.id)}
									>
										<Trash2 className="size-4" />
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
