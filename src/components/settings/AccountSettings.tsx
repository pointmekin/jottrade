import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { portfolioQueryKey, useCurrency } from "@/hooks/use-currency";
import {
	currencySymbol,
	formatMoney,
	SUPPORTED_CURRENCIES,
} from "@/lib/currency";
import {
	addCashFlow,
	deleteCashFlow,
	getCashFlows,
	updatePortfolio,
} from "@/server/portfolioActions";

const CashFlowKind = {
	Deposit: "deposit",
	Withdrawal: "withdrawal",
} as const;

type CashFlowKind = (typeof CashFlowKind)[keyof typeof CashFlowKind];

const today = () => format(new Date(), "yyyy-MM-dd");

export function AccountSettings() {
	const queryClient = useQueryClient();
	const currency = useCurrency();

	const [kind, setKind] = useState<CashFlowKind>(CashFlowKind.Deposit);
	const [amount, setAmount] = useState("");
	const [occurredAt, setOccurredAt] = useState(today);
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);

	const amountId = useId();
	const dateId = useId();
	const noteId = useId();

	const { data: flows = [], isLoading } = useQuery({
		queryKey: ["cash-flows"],
		queryFn: () => getCashFlows({ data: undefined }),
	});

	const invalidateBalances = () => {
		queryClient.invalidateQueries({ queryKey: ["cash-flows"] });
		queryClient.invalidateQueries({ queryKey: ["analytics"] });
		queryClient.invalidateQueries({ queryKey: ["advanced-analytics"] });
	};

	const currencyMutation = useMutation({
		mutationFn: (next: string) =>
			updatePortfolio({ data: { currency: next } } as never),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: portfolioQueryKey });
		},
	});

	const addMutation = useMutation({
		mutationFn: (input: {
			occurredAt: string;
			amount: number;
			note?: string;
		}) => addCashFlow({ data: input } as never),
		onSuccess: () => {
			setAmount("");
			setNote("");
			setError(null);
			invalidateBalances();
		},
		onError: (err: unknown) => {
			setError(
				err instanceof Error ? err.message : "Could not save the entry.",
			);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => deleteCashFlow({ data: { id } } as never),
		onSuccess: invalidateBalances,
		onError: (err: unknown) => {
			setError(
				err instanceof Error ? err.message : "Could not delete the entry.",
			);
		},
	});

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		const parsed = Number.parseFloat(amount);

		if (!Number.isFinite(parsed) || parsed <= 0) {
			setError("Enter an amount above zero.");
			return;
		}

		addMutation.mutate({
			occurredAt,
			amount: kind === CashFlowKind.Withdrawal ? -parsed : parsed,
			note: note.trim() || undefined,
		});
	};

	const total = flows.reduce((sum, flow) => sum + flow.amount, 0);

	return (
		<div className="space-y-6">
			<div className="surface space-y-4 p-5">
				<SectionHeading title="Account currency" detail="Applies everywhere" />
				<div className="flex items-center justify-between gap-5 py-2">
					<div>
						<p className="text-sm font-medium text-foreground">
							Reporting currency
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Every balance, P&amp;L, and deposit is labelled in this currency.
							Amounts are not converted.
						</p>
					</div>
					<Select
						value={currency}
						onValueChange={(next) => currencyMutation.mutate(next)}
						disabled={currencyMutation.isPending}
					>
						<SelectTrigger className="h-9 w-40" aria-label="Reporting currency">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SUPPORTED_CURRENCIES.map((code) => (
								<SelectItem key={code} value={code}>
									{currencySymbol(code)} {code}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="surface space-y-4 p-5">
				<SectionHeading
					title="Deposits and withdrawals"
					detail={`Net funded ${formatMoney(total, currency)} ${currency}`}
				/>
				<p className="text-xs text-muted-foreground">
					The account balance is what you funded plus realized P&amp;L. Record
					each transfer so a later deposit does not read as a profit.
				</p>

				<form
					onSubmit={submit}
					className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[auto_1fr_1fr_1fr_auto] sm:items-end"
				>
					<div className="grid gap-2">
						<Label htmlFor={`${amountId}-kind`}>Type</Label>
						<Select
							value={kind}
							onValueChange={(next) => setKind(next as CashFlowKind)}
						>
							<SelectTrigger id={`${amountId}-kind`} className="h-9 w-36">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={CashFlowKind.Deposit}>Deposit</SelectItem>
								<SelectItem value={CashFlowKind.Withdrawal}>
									Withdrawal
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="grid gap-2">
						<Label htmlFor={amountId}>
							Amount ({currencySymbol(currency)} {currency})
						</Label>
						<Input
							id={amountId}
							type="number"
							step="0.01"
							min="0"
							inputMode="decimal"
							placeholder="0.00"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							className="h-9"
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor={dateId}>Date</Label>
						<Input
							id={dateId}
							type="date"
							value={occurredAt}
							max={today()}
							onChange={(e) => setOccurredAt(e.target.value)}
							className="h-9"
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor={noteId}>Note (optional)</Label>
						<Input
							id={noteId}
							value={note}
							placeholder="Wire from bank"
							onChange={(e) => setNote(e.target.value)}
							className="h-9"
						/>
					</div>

					<Button
						type="submit"
						className="h-9"
						disabled={addMutation.isPending}
					>
						{addMutation.isPending ? "Saving…" : "Add"}
					</Button>
				</form>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<div className="border-t border-border pt-4">
					{isLoading && <Spinner />}

					{!isLoading && flows.length === 0 && (
						<p className="py-4 text-sm text-muted-foreground">
							No transfers recorded. The balance starts at zero.
						</p>
					)}

					{flows.length > 0 && (
						<ul className="divide-y divide-border">
							{flows.map((flow) => (
								<li
									key={flow.id}
									className="flex items-center justify-between gap-4 py-2.5"
								>
									<div className="min-w-0">
										<p
											className={`font-data text-sm font-medium ${flow.amount >= 0 ? "text-success" : "text-destructive"}`}
										>
											{formatMoney(flow.amount, currency, { signed: true })}
										</p>
										<p className="mt-0.5 truncate text-xs text-muted-foreground">
											{format(new Date(flow.occurredAt), "dd MMM yyyy")}
											{flow.note && ` · ${flow.note}`}
										</p>
									</div>
									<Button
										variant="ghost"
										size="icon"
										aria-label="Delete entry"
										className="size-8 text-muted-foreground hover:text-destructive"
										disabled={deleteMutation.isPending}
										onClick={() => deleteMutation.mutate(flow.id)}
									>
										<Trash2 className="size-4" />
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
