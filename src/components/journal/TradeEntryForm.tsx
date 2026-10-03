import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useAccounts } from "@/hooks/use-accounts";
import { localDateTimeToIso, toDateTimeLocalValue } from "@/lib/date";
import { invalidateTradeQueries } from "@/lib/query-keys";
import { TradeSide } from "@/lib/trade";
import {
	type TradeCaptureDraft,
	type TradeCaptureValues,
	tradeCaptureSchema,
} from "@/lib/trade-capture";
import { createTrade } from "@/server/tradeActions";
import { TradeCloseFields, TradeEntryFields } from "./trade-entry-fields";
import { RiskFields } from "./trade-risk-fields";

export function TradeEntryForm(props: {
	onSuccess?: () => void;
	onCancel?: () => void;
	initialDraft?: TradeCaptureDraft;
}) {
	const { activeAccount } = useAccounts();
	if (!activeAccount && !props.initialDraft)
		return <p>Loading the reviewed account…</p>;
	const draft = { portfolioId: activeAccount?.id ?? 0, ...props.initialDraft };
	return <TradeEntryCapture {...props} initialDraft={draft} />;
}

function TradeEntryCapture({
	onSuccess,
	onCancel,
	initialDraft,
}: {
	onSuccess?: () => void;
	onCancel?: () => void;
	initialDraft?: TradeCaptureDraft;
}) {
	const { accounts, activeAccount } = useAccounts();
	const [accountId] = useState(initialDraft?.portfolioId ?? activeAccount?.id);
	const account = accounts.find((item) => item.id === accountId);
	const client = useQueryClient();
	const form = useForm<TradeCaptureValues>({
		resolver: zodResolver(tradeCaptureSchema),
		defaultValues: {
			symbol: "",
			side: TradeSide.Long,
			entryPrice: "",
			quantity: "",
			entryDate: toDateTimeLocalValue(new Date()),
			targetPrice: "",
			initialStopPrice: "",
			entryQuoteToAccountRate: "",
			balanceAccount: "",
			confirmedUnitQuoteCurrency: "",
			exitPrice: "",
			exitDate: "",
			fees: "",
			notes: "",
			exitQuoteToAccountRate: "",
			...initialDraft,
		},
	});
	const observed = useWatch({ control: form.control });
	const values = { ...form.getValues(), ...observed };
	const sideLabel = values.side === TradeSide.Long ? "Long" : "Short";
	const save = useMutation({
		mutationFn: (capture: TradeCaptureValues) => {
			if (!account) throw new Error("The reviewed account is unavailable.");
			return createTrade({
				data: {
					...capture,
					portfolioId: account.id,
					entryDate: localDateTimeToIso(capture.entryDate),
					exitDate: capture.exitDate
						? localDateTimeToIso(capture.exitDate)
						: undefined,
				},
			});
		},
		onSuccess: async () => {
			await invalidateTradeQueries(client);
			onSuccess?.();
		},
	});
	return (
		<Form {...form}>
			<form
				className="space-y-4"
				onSubmit={form.handleSubmit((capture) => save.mutate(capture))}
			>
				<p className="text-sm">
					Account: {account?.name ?? "Unavailable"} · {account?.currency}
				</p>
				<fieldset disabled={save.isPending} className="space-y-4">
					<TradeEntryFields form={form} />
					<RiskFields
						values={values}
						currency={account?.currency ?? "USD"}
						onChange={(patch) => {
							for (const [key, value] of Object.entries(patch))
								form.setValue(key as keyof TradeCaptureValues, value, {
									shouldValidate: true,
								});
						}}
					/>
					<TradeCloseFields form={form} />
					{save.error && (
						<p role="alert" className="text-sm text-destructive">
							{save.error.message}
						</p>
					)}
					<div className="flex gap-2">
						{onCancel && (
							<Button type="button" variant="outline" onClick={onCancel}>
								Cancel
							</Button>
						)}
						<Button type="submit" disabled={!account}>
							{save.isPending ? "Logging…" : `Log ${sideLabel}`}
						</Button>
					</div>
				</fieldset>
			</form>
		</Form>
	);
}
