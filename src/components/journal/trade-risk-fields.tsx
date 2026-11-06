import { ChevronRight } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useFormContext } from "react-hook-form";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
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
interface RiskFieldsProps {
	values: TradeCaptureValues;
	currency: string;
	portfolioId?: number;
	onChange: (patch: Partial<RiskInputs & { ruleNote: string }>) => void;
	/** Shows the stop next to `leading` and folds the rare inputs away. */
	isCompact?: boolean;
	leading?: ReactNode;
}

export function RiskFields({
	values,
	currency,
	portfolioId,
	onChange,
	isCompact = false,
	leading,
}: RiskFieldsProps) {
	const unknown = !resolveInstrumentSpec(values.symbol).quoteCurrency;
	const inputs = FIELDS.map(([name, label]) => (
		<RiskInput
			key={name}
			name={name}
			label={label}
			value={values[name] ?? ""}
			onChange={(value) => onChange({ [name]: value })}
		/>
	));
	const quoteInput = (unknown ||
		Boolean(values.confirmedUnitQuoteCurrency)) && (
		<RiskInput
			name="confirmedUnitQuoteCurrency"
			label="Confirm unit-based quantity: quote currency"
			value={values.confirmedUnitQuoteCurrency ?? ""}
			onChange={(value) =>
				onChange({ confirmedUnitQuoteCurrency: value.toUpperCase() })
			}
		/>
	);
	const note = (
		<p className="text-xs text-muted-foreground">
			Stop-distance risk excludes costs. Entry FX is historical and separate
			from exit FX. Balance is optional; review it at the original entry time.
		</p>
	);
	const previews = (
		<>
			<RiskPreview values={values} currency={currency} />
			{portfolioId !== undefined && (
				<RuleCheckPreview
					values={values}
					portfolioId={portfolioId}
					onNoteChange={(ruleNote) => onChange({ ruleNote })}
				/>
			)}
		</>
	);
	if (!isCompact)
		return (
			<section className="space-y-3" aria-label="Original risk plan">
				{inputs}
				{quoteInput}
				{previews}
				{note}
			</section>
		);
	const [stop, ...rare] = inputs;
	const hasRareValues = Boolean(
		values.entryQuoteToAccountRate || values.balanceAccount,
	);
	return (
		<section className="space-y-3" aria-label="Original risk plan">
			<div className="grid grid-cols-2 gap-3">
				{leading}
				{stop}
			</div>
			{quoteInput}
			{previews}
			<FoldedFields title="FX rate and balance" isOpen={hasRareValues}>
				{rare}
				{note}
			</FoldedFields>
		</section>
	);
}

export function FoldedFields({
	title,
	hint,
	isOpen,
	children,
}: {
	title: string;
	hint?: string;
	isOpen: boolean;
	children: ReactNode;
}) {
	return (
		<details className="group" open={isOpen}>
			<summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
				<ChevronRight className="size-4 transition-transform duration-200 group-open:rotate-90" />
				<span className="font-medium">{title}</span>
				{hint && <span className="text-xs">{hint}</span>}
			</summary>
			<div className="mt-3 space-y-3">{children}</div>
		</details>
	);
}

type RiskFieldName = (typeof FIELDS)[number][0] | "confirmedUnitQuoteCurrency";

function RiskInput({
	name,
	label,
	value,
	onChange,
}: {
	name: RiskFieldName;
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const form = useFormContext<TradeCaptureValues>();
	const id = useId();
	const isQuote = name === "confirmedUnitQuoteCurrency";
	const description = isQuote
		? "Entering a currency confirms this quantity is units, not broker lots. Leave blank if the contract is unknown."
		: undefined;
	const inputProps = {
		inputMode: isQuote ? ("text" as const) : ("decimal" as const),
		maxLength: isQuote ? 3 : undefined,
		placeholder: isQuote ? "e.g. USD" : undefined,
		value,
		onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
			onChange(event.target.value),
	};
	if (!form)
		return (
			<div className="space-y-1.5">
				<Label htmlFor={id}>{label}</Label>
				<Input {...inputProps} id={id} />
				{description && (
					<p className="text-xs text-muted-foreground">{description}</p>
				)}
			</div>
		);
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<FormControl>
						<Input
							{...inputProps}
							name={field.name}
							ref={field.ref}
							onBlur={field.onBlur}
						/>
					</FormControl>
					{description && (
						<FormDescription className="text-xs">{description}</FormDescription>
					)}
					<FormMessage role="alert" />
				</FormItem>
			)}
		/>
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
