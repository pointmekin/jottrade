import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/use-accounts";
import { AccountEntryKind } from "@/lib/account-entry";
import { resolveCommandSymbol } from "@/lib/commands/aliases";
import {
	type AccountEntryParams,
	IntentType,
	type WriteIntent,
} from "@/lib/commands/types";
import { localDateTimeToIso, toDateTimeLocalValue } from "@/lib/date";
import {
	invalidateAccountEntryQueries,
	invalidateTradeQueries,
} from "@/lib/query-keys";
import { TradeSide } from "@/lib/trade";
import {
	type TradeCaptureValues,
	tradeCaptureSchema,
} from "@/lib/trade-capture";
import { RiskCaptureSource } from "@/lib/trade-risk-schema";
import { addCashFlow } from "@/server/cashFlowActions";
import type { AccountRecord } from "@/server/portfolioActions";
import { createTrade } from "@/server/tradeActions";
import { TextField, TradeFields } from "./command-trade-fields";

const SELECT_CLASS =
	"h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const DECIMAL_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const CENTS_PATTERN = /^\d+(?:\.\d{1,2})?$/;

const isPositive = (value: string) =>
	DECIMAL_PATTERN.test(value) && Number(value) > 0;

type TradeDraft = TradeCaptureValues;

async function saveTrade(accountId: number, draft: TradeDraft) {
	const capture = tradeCaptureSchema.parse(draft);
	await createTrade({
		data: {
			...capture,
			portfolioId: accountId,
			entryDate: localDateTimeToIso(capture.entryDate),
			exitDate: capture.exitDate
				? localDateTimeToIso(capture.exitDate)
				: undefined,
			captureSource: RiskCaptureSource.Command,
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
		initialStopPrice: params.initialStopPrice ?? "",
		entryDate: toDateTimeLocalValue(new Date()),
		entryQuoteToAccountRate: "",
		balanceAccount: "",
		confirmedUnitQuoteCurrency: "",
		exitPrice: "",
		exitDate: "",
		exitQuoteToAccountRate: "",
		fees: "",
	};
}

function requestedCurrencyOf(intent: WriteIntent) {
	if (intent.type === IntentType.AccountEntry) return intent.params.currency;
	return undefined;
}

function initialAmount(intent: WriteIntent) {
	if (intent.type === IntentType.AccountEntry)
		return intent.params.amount ?? "";
	return "";
}

function useSaveIntent(
	intent: WriteIntent,
	handlers: {
		save: () => Promise<void>;
		onSaved: () => void;
		onFailed: (cause: Error) => void;
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
	const [amount, setAmount] = useState(() => initialAmount(intent));
	const [error, setError] = useState<string>();
	const saving = useRef(false);
	const requestedCurrency = requestedCurrencyOf(intent);
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
		onFailed: (cause) => setError(`Could not save. ${cause.message}`),
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
						currency={account?.currency ?? "USD"}
						portfolioId={account?.id}
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
