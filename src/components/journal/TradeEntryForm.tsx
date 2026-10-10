import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useAccounts } from "@/hooks/use-accounts";
import { useTradeDraft } from "@/hooks/use-trade-draft";
import { authClient } from "@/lib/auth-client";
import { localDateTimeToIso, toDateTimeLocalValue } from "@/lib/date";
import { invalidateTradeQueries } from "@/lib/query-keys";
import { TradeSide } from "@/lib/trade";
import {
	type TradeCaptureDraft,
	type TradeCaptureValues,
	tradeCaptureSchema,
} from "@/lib/trade-capture";
import { createTrade } from "@/server/tradeActions";
import { TradeDraftChoice, TradeDraftNotice } from "./trade-draft-notice";
import {
	TradeCloseFields,
	TradeEntryFields,
	TradeStrategyField,
} from "./trade-entry-fields";
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

function blankCapture(): TradeCaptureValues {
	return {
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
	};
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
	const { data: session } = authClient.useSession();
	const [accountId] = useState(initialDraft?.portfolioId ?? activeAccount?.id);
	const account = accounts.find((item) => item.id === accountId);
	const client = useQueryClient();
	const draft = useTradeDraft(session?.user.id, accountId);
	const { schedule } = draft;
	const hasPreset = Object.keys(initialDraft ?? {}).some(
		(key) => key !== "portfolioId",
	);
	const [isChoosing, setIsChoosing] = useState(
		Boolean(draft.restored) && hasPreset,
	);
	const startValues = () => ({ ...blankCapture(), ...initialDraft });
	const form = useForm<TradeCaptureValues>({
		resolver: zodResolver(tradeCaptureSchema),
		defaultValues: draft.restored
			? { ...blankCapture(), ...draft.restored }
			: startValues(),
	});
	useEffect(() => {
		const subscription = form.watch((changed, { name }) => {
			if (name) schedule(changed);
		});
		return () => subscription.unsubscribe();
	}, [form, schedule]);
	const discard = () => {
		draft.discard();
		form.reset(startValues());
	};
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
					clientDraftId: draft.draftId,
				},
			});
		},
		onSuccess: async () => {
			draft.logged();
			await invalidateTradeQueries(client);
			toast.success("Trade saved to journal");
			onSuccess?.();
		},
	});
	if (isChoosing)
		return (
			<TradeDraftChoice
				savedAt={draft.savedAt}
				onContinue={() => setIsChoosing(false)}
				onStartNew={() => {
					discard();
					setIsChoosing(false);
				}}
			/>
		);
	return (
		<Form {...form}>
			<form
				className="space-y-4"
				onSubmit={form.handleSubmit((capture) => {
					draft.flush();
					save.mutate(capture);
				})}
			>
				<p className="text-sm">
					Account: {account?.name ?? "Unavailable"} · {account?.currency}
				</p>
				<fieldset disabled={save.isPending} className="space-y-4">
					<TradeDraftNotice
						savedAt={draft.savedAt}
						isUnreadable={draft.isUnreadable}
						storageError={draft.storageError}
						onDiscard={discard}
					/>
					<TradeEntryFields form={form} />
					<TradeStrategyField form={form} />
					<RiskFields
						values={values}
						currency={account?.currency ?? "USD"}
						portfolioId={account?.id}
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
							Not saved. Your draft stays on this device. {save.error.message}
						</p>
					)}
					<div className="flex gap-2">
						{onCancel && (
							<Button
								type="button"
								variant="outline"
								className="max-sm:h-11"
								onClick={onCancel}
							>
								Cancel
							</Button>
						)}
						<Button type="submit" className="max-sm:h-11" disabled={!account}>
							{save.isPending ? "Logging…" : `Log ${sideLabel}`}
						</Button>
					</div>
				</fieldset>
			</form>
		</Form>
	);
}
