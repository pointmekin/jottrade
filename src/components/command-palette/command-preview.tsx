import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountEntriesQueryKey } from "@/hooks/use-account-entries";
import { useAccounts } from "@/hooks/use-accounts";
import { AccountEntryKind } from "@/lib/account-entry";
import { resolveCommandSymbol } from "@/lib/commands/aliases";
import type { WriteIntent } from "@/lib/commands/types";
import { resolveInstrumentSpec } from "@/lib/instruments";
import { invalidateTradeQueries } from "@/lib/trade-queries";
import { addCashFlow } from "@/server/portfolioActions";
import { createTrade } from "@/server/tradeActions";

function positive(value: string): boolean {
	return (
		/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) &&
		Number.isFinite(Number(value)) &&
		Number(value) > 0
	);
}

export function CommandPreview({
	intent,
	warning,
	onBack,
	onSuccess,
	onSavingChange,
}: {
	intent: WriteIntent;
	warning?: string;
	onBack: () => void;
	onSuccess: () => void;
	onSavingChange?: (saving: boolean) => void;
}) {
	const id = useId();
	const { accounts, activeAccount } = useAccounts();
	const queryClient = useQueryClient();
	// Freeze the reviewed account even if another part of the app changes the active account.
	const [accountId, setAccountId] = useState(activeAccount?.id);
	const account = accounts.find((item) => item.id === accountId);
	const trade = intent.type === "trade" ? intent.params : {};
	const [symbol, setSymbol] = useState(trade.symbol ?? "");
	const [side, setSide] = useState(trade.side ?? "LONG");
	const [entryPrice, setEntryPrice] = useState(trade.entryPrice ?? "");
	const [quantity, setQuantity] = useState(trade.quantity ?? "");
	const [targetPrice, setTargetPrice] = useState(trade.targetPrice ?? "");
	const [amount, setAmount] = useState(
		intent.type === "account-entry" ? (intent.params.amount ?? "") : "",
	);
	const [error, setError] = useState<string>();
	const saving = useRef(false);
	const normalizedSymbol = resolveCommandSymbol(symbol.trim());
	const unit =
		resolveInstrumentSpec(normalizedSymbol).quantityUnit === "LOTS"
			? "lots"
			: "units";
	const currencyMismatch =
		intent.type === "account-entry" &&
		intent.params.currency &&
		account &&
		intent.params.currency !== account.currency;
	const mutation = useMutation({
		mutationFn: async () => {
			if (!account) throw new Error("Choose an account before saving.");
			if (currencyMismatch)
				throw new Error(
					`Choose an account in ${intent.type === "account-entry" ? intent.params.currency : "the requested currency"}. Currency conversion is not supported here.`,
				);
			if (intent.type === "trade") {
				if (
					!/^[A-Z][A-Z0-9./_-]{0,39}$/.test(normalizedSymbol) ||
					!positive(entryPrice) ||
					!positive(quantity) ||
					(targetPrice !== "" && !positive(targetPrice))
				)
					throw new Error(
						"Enter a symbol, positive entry price and quantity, and a positive target if provided.",
					);
				await createTrade({
					data: {
						portfolioId: account.id,
						symbol: normalizedSymbol,
						side,
						entryPrice,
						quantity,
						targetPrice: targetPrice || undefined,
						entryDate: new Date().toISOString(),
					},
				});
			} else {
				if (!positive(amount) || !/^\d+(?:\.\d{1,2})?$/.test(amount))
					throw new Error(
						"Enter a positive amount with at most two decimal places.",
					);
				await addCashFlow({
					data: {
						portfolioId: account.id,
						kind: intent.params.kind,
						amount:
							intent.params.kind === AccountEntryKind.Withdrawal
								? -Number(amount)
								: Number(amount),
						occurredAt: new Date().toISOString(),
					},
				});
			}
		},
		onSuccess: async () => {
			await Promise.all([
				invalidateTradeQueries(queryClient),
				queryClient.invalidateQueries({ queryKey: accountEntriesQueryKey }),
			]);
			toast.success(
				intent.type === "trade" ? "Trade logged" : "Account entry added",
			);
			onSuccess();
		},
		onError: () =>
			setError("Could not save. Check the fields and account, then try again."),
		onSettled: () => {
			saving.current = false;
			onSavingChange?.(false);
		},
	});
	const title =
		intent.type === "trade"
			? "Log trade"
			: intent.params.kind === AccountEntryKind.Deposit
				? "Add deposit"
				: "Add withdrawal";
	return (
		<form
			className="space-y-4 p-5"
			onSubmit={(event) => {
				event.preventDefault();
				if (saving.current) return;
				saving.current = true;
				onSavingChange?.(true);
				setError(undefined);
				mutation.mutate();
			}}
		>
			<div>
				<h2 className="font-semibold">{title}</h2>
				<p className="text-sm text-muted-foreground">
					Review the details, then confirm to save.
				</p>
			</div>
			{warning && (
				<output className="text-sm text-muted-foreground">{warning}</output>
			)}
			<fieldset disabled={mutation.isPending} className="space-y-4">
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-account`}>Account</Label>
					<select
						id={`${id}-account`}
						className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
						value={accountId ?? ""}
						onChange={(event) => setAccountId(Number(event.target.value))}
						required
					>
						<option value="" disabled>
							Choose an account
						</option>
						{accounts.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name} · {item.currency}
							</option>
						))}
					</select>
				</div>
				{intent.type === "trade" ? (
					<>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor={`${id}-symbol`}>Symbol</Label>
								<Input
									id={`${id}-symbol`}
									value={symbol}
									onChange={(event) => setSymbol(event.target.value)}
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor={`${id}-side`}>Side</Label>
								<select
									id={`${id}-side`}
									className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
									value={side}
									onChange={(event) =>
										setSide(event.target.value === "SHORT" ? "SHORT" : "LONG")
									}
								>
									<option value="LONG">Long</option>
									<option value="SHORT">Short</option>
								</select>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor={`${id}-entry`}>Entry price</Label>
								<Input
									id={`${id}-entry`}
									inputMode="decimal"
									value={entryPrice}
									onChange={(event) => setEntryPrice(event.target.value)}
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor={`${id}-quantity`}>Quantity ({unit})</Label>
								<Input
									id={`${id}-quantity`}
									inputMode="decimal"
									value={quantity}
									onChange={(event) => setQuantity(event.target.value)}
									required
								/>
							</div>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-target`}>
								Planned target price (optional)
							</Label>
							<Input
								id={`${id}-target`}
								inputMode="decimal"
								value={targetPrice}
								onChange={(event) => setTargetPrice(event.target.value)}
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							Creates an open trade with the current entry date. A target does
							not close the trade.
						</p>
					</>
				) : (
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-amount`}>
							Amount ({account?.currency ?? "account currency"})
						</Label>
						<Input
							id={`${id}-amount`}
							inputMode="decimal"
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							required
						/>
						<p className="text-xs text-muted-foreground">
							Recorded now in the selected account currency.
						</p>
					</div>
				)}
				{currencyMismatch && (
					<p role="alert" className="text-sm text-destructive">
						The command specifies{" "}
						{intent.type === "account-entry" && intent.params.currency}. Choose
						an account in that currency.
					</p>
				)}
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				<div className="flex justify-between gap-3">
					<Button type="button" variant="outline" onClick={onBack}>
						Back
					</Button>
					<Button
						type="submit"
						disabled={!account || !!currencyMismatch || mutation.isPending}
					>
						{mutation.isPending ? "Saving…" : "Confirm and save"}
					</Button>
				</div>
			</fieldset>
		</form>
	);
}
