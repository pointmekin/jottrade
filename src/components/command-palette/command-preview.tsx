import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/use-accounts";
import { AccountEntryKind } from "@/lib/account-entry";
import { resolveCommandSymbol } from "@/lib/commands/aliases";
import {
	type AccountEntryParams,
	IntentType,
	type TradeParams,
	type WriteIntent,
} from "@/lib/commands/types";
import { resolveInstrumentSpec } from "@/lib/instruments";
import {
	invalidateAccountEntryQueries,
	invalidateTradeQueries,
} from "@/lib/query-keys";
import { TradeSide } from "@/lib/trade";
import { addCashFlow } from "@/server/cashFlowActions";
import type { AccountRecord } from "@/server/portfolioActions";
import { createTrade } from "@/server/tradeActions";

const SELECT_CLASS =
	"h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const SYMBOL_PATTERN = /^[A-Z][A-Z0-9./_-]{0,39}$/;
const DECIMAL_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const CENTS_PATTERN = /^\d+(?:\.\d{1,2})?$/;

const isPositive = (value: string) =>
	DECIMAL_PATTERN.test(value) && Number(value) > 0;

type TradeDraft = Required<Omit<TradeParams, "side">> & { side: TradeSide };

async function saveTrade(accountId: number, draft: TradeDraft) {
	const isValid =
		SYMBOL_PATTERN.test(draft.symbol) &&
		isPositive(draft.entryPrice) &&
		isPositive(draft.quantity) &&
		(draft.targetPrice === "" || isPositive(draft.targetPrice));
	if (!isValid) {
		throw new Error(
			"Enter a symbol, positive entry price and quantity, and a positive target if provided.",
		);
	}
	await createTrade({
		data: {
			portfolioId: accountId,
			...draft,
			targetPrice: draft.targetPrice || undefined,
			entryDate: new Date().toISOString(),
		},
	});
}

async function saveAccountEntry(
	accountId: number,
	params: AccountEntryParams,
	amount: string,
) {
	if (!isPositive(amount) || !CENTS_PATTERN.test(amount)) {
		throw new Error("Enter a positive amount with at most two decimal places.");
	}
	const sign = params.kind === AccountEntryKind.Withdrawal ? -1 : 1;
	await addCashFlow({
		data: {
			portfolioId: accountId,
			kind: params.kind,
			amount: sign * Number(amount),
			occurredAt: new Date().toISOString(),
		},
	});
}

function titleOf(intent: WriteIntent) {
	if (intent.type === IntentType.Trade) return "Log trade";
	return intent.params.kind === AccountEntryKind.Deposit
		? "Add deposit"
		: "Add withdrawal";
}

function TextField({
	id,
	label,
	value,
	onChange,
	isRequired = true,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	isRequired?: boolean;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				inputMode="decimal"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				required={isRequired}
			/>
		</div>
	);
}

function TradeFields({
	id,
	draft,
	onChange,
}: {
	id: string;
	draft: TradeDraft;
	onChange: (patch: Partial<TradeDraft>) => void;
}) {
	const unit =
		resolveInstrumentSpec(resolveCommandSymbol(draft.symbol.trim()))
			.quantityUnit === "LOTS"
			? "lots"
			: "units";

	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<TextField
					id={`${id}-symbol`}
					label="Symbol"
					value={draft.symbol}
					onChange={(symbol) => onChange({ symbol })}
				/>
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-side`}>Side</Label>
					<select
						id={`${id}-side`}
						className={SELECT_CLASS}
						value={draft.side}
						onChange={(event) =>
							onChange({
								side:
									event.target.value === TradeSide.Short
										? TradeSide.Short
										: TradeSide.Long,
							})
						}
					>
						<option value={TradeSide.Long}>Long</option>
						<option value={TradeSide.Short}>Short</option>
					</select>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<TextField
					id={`${id}-entry`}
					label="Entry price"
					value={draft.entryPrice}
					onChange={(entryPrice) => onChange({ entryPrice })}
				/>
				<TextField
					id={`${id}-quantity`}
					label={`Quantity (${unit})`}
					value={draft.quantity}
					onChange={(quantity) => onChange({ quantity })}
				/>
			</div>
			<TextField
				id={`${id}-target`}
				label="Planned target price (optional)"
				value={draft.targetPrice}
				onChange={(targetPrice) => onChange({ targetPrice })}
				isRequired={false}
			/>
			<p className="text-xs text-muted-foreground">
				Creates an open trade with the current entry date. A target does not
				close the trade.
			</p>
		</>
	);
}

function AccountSelect({
	id,
	accounts,
	value,
	onChange,
}: {
	id: string;
	accounts: AccountRecord[];
	value: number | undefined;
	onChange: (id: number) => void;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>Account</Label>
			<select
				id={id}
				className={SELECT_CLASS}
				value={value ?? ""}
				onChange={(event) => onChange(Number(event.target.value))}
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
	);
}

function initialDraft(intent: WriteIntent): TradeDraft {
	const params = intent.type === IntentType.Trade ? intent.params : {};
	return {
		symbol: params.symbol ?? "",
		side: params.side ?? TradeSide.Long,
		entryPrice: params.entryPrice ?? "",
		quantity: params.quantity ?? "",
		targetPrice: params.targetPrice ?? "",
	};
}

function useSaveIntent(
	intent: WriteIntent,
	handlers: {
		save: () => Promise<void>;
		onSaved: () => void;
		onFailed: () => void;
		onSettled: () => void;
	},
) {
	const queryClient = useQueryClient();
	const isTrade = intent.type === IntentType.Trade;
	return useMutation({
		mutationFn: handlers.save,
		onSuccess: async () => {
			await (isTrade
				? invalidateTradeQueries(queryClient)
				: invalidateAccountEntryQueries(queryClient));
			toast.success(isTrade ? "Trade logged" : "Account entry added");
			handlers.onSaved();
		},
		onError: handlers.onFailed,
		onSettled: handlers.onSettled,
	});
}

interface CommandPreviewProps {
	intent: WriteIntent;
	warning?: string;
	onBack: () => void;
	onSuccess: () => void;
	onSavingChange?: (saving: boolean) => void;
}

export function CommandPreview({
	intent,
	warning,
	onBack,
	onSuccess,
	onSavingChange,
}: CommandPreviewProps) {
	const id = useId();
	const { accounts, activeAccount } = useAccounts();
	// Freeze the reviewed account even if another part of the app changes the active account.
	const [accountId, setAccountId] = useState(activeAccount?.id);
	const account = accounts.find((item) => item.id === accountId);
	const [draft, setDraft] = useState(() => initialDraft(intent));
	const [amount, setAmount] = useState(
		intent.type === IntentType.AccountEntry ? (intent.params.amount ?? "") : "",
	);
	const [error, setError] = useState<string>();
	const saving = useRef(false);
	const requestedCurrency =
		intent.type === IntentType.AccountEntry
			? intent.params.currency
			: undefined;
	const hasCurrencyMismatch = Boolean(
		requestedCurrency && account && requestedCurrency !== account.currency,
	);
	const mutation = useSaveIntent(intent, {
		save: async () => {
			if (!account) throw new Error("Choose an account before saving.");
			if (intent.type === IntentType.Trade) {
				await saveTrade(account.id, {
					...draft,
					symbol: resolveCommandSymbol(draft.symbol.trim()),
				});
				return;
			}
			await saveAccountEntry(account.id, intent.params, amount);
		},
		onSaved: onSuccess,
		onFailed: () =>
			setError("Could not save. Check the fields and account, then try again."),
		onSettled: () => {
			saving.current = false;
			onSavingChange?.(false);
		},
	});

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
				<h2 className="font-semibold">{titleOf(intent)}</h2>
				<p className="text-sm text-muted-foreground">
					Review the details, then confirm to save.
				</p>
			</div>
			{warning && (
				<output className="text-sm text-muted-foreground">{warning}</output>
			)}
			<fieldset disabled={mutation.isPending} className="space-y-4">
				<AccountSelect
					id={`${id}-account`}
					accounts={accounts}
					value={accountId}
					onChange={setAccountId}
				/>
				{intent.type === IntentType.Trade && (
					<TradeFields
						id={id}
						draft={draft}
						onChange={(patch) => setDraft({ ...draft, ...patch })}
					/>
				)}
				{intent.type === IntentType.AccountEntry && (
					<div className="space-y-1.5">
						<TextField
							id={`${id}-amount`}
							label={`Amount (${account?.currency ?? "account currency"})`}
							value={amount}
							onChange={setAmount}
						/>
						<p className="text-xs text-muted-foreground">
							Recorded now in the selected account currency.
						</p>
					</div>
				)}
				{hasCurrencyMismatch && (
					<p role="alert" className="text-sm text-destructive">
						{`The command specifies ${requestedCurrency}. Choose an account in that currency.`}
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
						disabled={!account || hasCurrencyMismatch || mutation.isPending}
					>
						{mutation.isPending ? "Saving…" : "Confirm and save"}
					</Button>
				</div>
			</fieldset>
		</form>
	);
}
