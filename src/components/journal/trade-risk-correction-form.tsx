import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/use-accounts";
import { localDateTimeToIso, toDateTimeLocalValue } from "@/lib/date";
import { invalidateTradeQueries } from "@/lib/query-keys";
import type { Trade } from "@/lib/trade";
import {
	type TradeCaptureValues,
	tradeCaptureSchema,
} from "@/lib/trade-capture";
import { SpecSource } from "@/lib/trade-risk-schema";
import { correctTradeInitialRisk } from "@/server/tradeRiskActions";
import { TradeEntryFields } from "./trade-entry-fields";
import { RiskFields } from "./trade-risk-fields";

export function TradeRiskCorrectionForm({
	trade,
	onClose,
}: {
	trade: Trade;
	onClose: () => void;
}) {
	const { accounts } = useAccounts();
	const account = accounts.find((item) => item.id === trade.portfolioId);
	const snapshot = trade.initialRiskSnapshot;
	const [expectedRevision] = useState(trade.editRevision ?? 0);
	const [initialEntryDate] = useState(
		snapshot?.entryDate ?? trade.entryDate.toISOString(),
	);
	const client = useQueryClient();
	const id = useId();
	const [reason, setReason] = useState("");
	const [correctExecutionInputs, setCorrectExecutionInputs] = useState(false);
	const form = useForm<TradeCaptureValues>({
		resolver: zodResolver(tradeCaptureSchema),
		defaultValues: correctionValues(trade),
	});
	const observed = useWatch({ control: form.control });
	const values = { ...form.getValues(), ...observed };
	const save = useMutation({
		mutationFn: (values: TradeCaptureValues) =>
			correctTradeInitialRisk({
				data: {
					...values,
					id: trade.id,
					expectedRevision,
					reason,
					correctExecutionInputs,
					entryDate:
						values.entryDate ===
						toDateTimeLocalValue(new Date(initialEntryDate))
							? initialEntryDate
							: localDateTimeToIso(values.entryDate),
				},
			}),
		onSuccess: async () => {
			await invalidateTradeQueries(client);
			onClose();
		},
	});
	return (
		<Form {...form}>
			<form
				className="space-y-4 border-t pt-4"
				onSubmit={form.handleSubmit((values) => save.mutate(values))}
			>
				<p className="text-sm">
					Review the actual original inputs. Current initial risk:{" "}
					{trade.initialRiskAmount ?? "unavailable"}{" "}
					{snapshot?.accountCurrency ?? account?.currency}. Previous plans
					remain in history.
				</p>
				<fieldset disabled={save.isPending} className="space-y-4">
					<TradeEntryFields form={form} />
					<RiskFields
						values={values}
						currency={account?.currency ?? snapshot?.accountCurrency ?? "USD"}
						onChange={(patch) => {
							for (const [key, value] of Object.entries(patch))
								form.setValue(key as keyof TradeCaptureValues, value, {
									shouldValidate: true,
								});
						}}
					/>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-reason`}>Correction reason</Label>
						<Input
							id={`${id}-reason`}
							required
							maxLength={500}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
					{!trade.importHash && (
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={correctExecutionInputs}
								onChange={(e) => setCorrectExecutionInputs(e.target.checked)}
							/>
							Also correct recorded execution symbol, side, entry date/price and
							quantity
						</label>
					)}
					<p className="text-xs text-muted-foreground">
						Risk-only correction preserves execution and broker net P&L.
						Correcting execution can recalculate manual P&L using its separate
						saved exit FX context.
					</p>
					{save.error && (
						<p role="alert" className="text-sm text-destructive">
							{save.error.message}
						</p>
					)}
					<div className="flex gap-2">
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel correction
						</Button>
						<Button type="submit" disabled={!account || !reason.trim()}>
							{save.isPending
								? "Correcting…"
								: "Confirm original-plan correction"}
						</Button>
					</div>
				</fieldset>
			</form>
		</Form>
	);
}

function correctionValues(trade: Trade): TradeCaptureValues {
	const snapshot = trade.initialRiskSnapshot;
	return {
		symbol: snapshot?.symbol ?? trade.symbol,
		side: snapshot?.side ?? trade.side,
		entryPrice: snapshot?.entryPrice ?? trade.entryPrice ?? "",
		quantity: snapshot?.quantity ?? trade.quantity ?? "",
		entryDate: toDateTimeLocalValue(
			new Date(snapshot?.entryDate ?? trade.entryDate),
		),
		targetPrice: trade.initialTargetPrice ?? trade.targetPrice ?? "",
		initialStopPrice: trade.initialStopPrice ?? "",
		entryQuoteToAccountRate: snapshot?.quoteToAccountRate ?? "",
		balanceAccount: snapshot?.balanceAccount ?? "",
		confirmedUnitQuoteCurrency:
			snapshot?.specSource === SpecSource.ConfirmedUnits
				? (snapshot.quoteCurrency ?? "")
				: "",
	};
}
