import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/currency";
import { resolveInstrumentSpec } from "@/lib/instruments";
import type { TradeCaptureValues } from "@/lib/trade-capture";
import {
	calculateInitialRisk,
	calculatePlannedRewardRisk,
} from "@/lib/trade-risk";
import type { RiskInputs } from "@/lib/trade-risk-schema";
import { RuleCheckPreview } from "./rule-check-preview";

const FIELDS = [
	["initialStopPrice", "Initial stop price"],
	["entryQuoteToAccountRate", "Entry FX rate (account money per quote unit)"],
	["balanceAccount", "Balance used for risk %"],
] as const;
export function RiskFields({
	values,
	currency,
	portfolioId,
	onChange,
}: {
	values: TradeCaptureValues;
	currency: string;
	portfolioId?: number;
	onChange: (patch: Partial<RiskInputs>) => void;
}) {
	const id = useId();
	const unknown = !resolveInstrumentSpec(values.symbol).quoteCurrency;
	return (
		<section className="space-y-3" aria-label="Original risk plan">
			{FIELDS.map(([name, label]) => (
				<div key={name} className="space-y-1.5">
					<Label htmlFor={`${id}-${name}`}>{label}</Label>
					<Input
						id={`${id}-${name}`}
						inputMode="decimal"
						value={values[name] ?? ""}
						onChange={(e) => onChange({ [name]: e.target.value })}
					/>
				</div>
			))}
			{unknown && (
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-quote`}>
						Confirm unit-based quantity: quote currency
					</Label>
					<Input
						id={`${id}-quote`}
						maxLength={3}
						placeholder="e.g. USD"
						value={values.confirmedUnitQuoteCurrency ?? ""}
						onChange={(e) =>
							onChange({
								confirmedUnitQuoteCurrency: e.target.value.toUpperCase(),
							})
						}
					/>
					<p className="text-xs text-muted-foreground">
						Entering a currency confirms this quantity is units, not broker
						lots. Leave blank if the contract is unknown.
					</p>
				</div>
			)}
			<RiskPreview values={values} currency={currency} />
			{portfolioId !== undefined && (
				<RuleCheckPreview values={values} portfolioId={portfolioId} />
			)}
			<p className="text-xs text-muted-foreground">
				Stop-distance risk excludes costs. Entry FX is historical and separate
				from exit FX. Balance is optional; review it at the original entry time.
			</p>
		</section>
	);
}

export function RiskPreview({
	values,
	currency,
}: {
	values: TradeCaptureValues;
	currency: string;
}) {
	let text: string;
	try {
		const plan = calculateInitialRisk({ ...values, accountCurrency: currency });
		if (plan.initialRiskAmount === null)
			text = plan.initialRiskSnapshot?.unavailableReason ?? "Risk unavailable";
		else {
			text = `Initial risk ${formatMoney(Number(plan.initialRiskAmount), currency)}`;
			if (plan.initialRiskPercent !== null)
				text += ` · ${Number(plan.initialRiskPercent).toFixed(2)}%`;
			else text += " · risk % unavailable without positive balance";
			const rr = calculatePlannedRewardRisk(plan.initialRiskSnapshot);
			if (rr !== null) text += ` · planned RR 1:${rr.toFixed(2)}`;
		}
	} catch (error) {
		text = error instanceof Error ? error.message : "Risk unavailable";
	}
	return (
		<output className="block text-sm" aria-live="polite">
			{text}
		</output>
	);
}
