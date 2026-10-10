import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { SectionHeading } from "@/components/app-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/use-accounts";
import { authClient } from "@/lib/auth-client";
import { invalidateRiskRuleQueries, QueryKey } from "@/lib/query-keys";
import {
	DailyLossUnit,
	hasRiskRules,
	type RiskRules,
	type RiskRulesInput,
	RULES_DISCLAIMER,
	riskRulesInputSchema,
} from "@/lib/risk-rules";
import {
	clearRiskRules,
	getRiskRules,
	type RiskRulesState,
	saveRiskRules,
} from "@/server/riskRuleActions";

type RulesForm = {
	tradeRiskAmount: string;
	tradeRiskPercent: string;
	dailyLossValue: string;
	dailyLossUnit: DailyLossUnit;
	tradesPerDay: string;
	cooldownAfterLosses: string;
	cooldownMinutes: string;
};

const EMPTY_FORM: RulesForm = {
	tradeRiskAmount: "",
	tradeRiskPercent: "",
	dailyLossValue: "",
	dailyLossUnit: DailyLossUnit.Amount,
	tradesPerDay: "",
	cooldownAfterLosses: "1",
	cooldownMinutes: "",
};

const toForm = (rules: RiskRules | undefined): RulesForm => ({
	tradeRiskAmount: rules?.maxTradeRiskAmount ?? "",
	tradeRiskPercent: rules?.maxTradeRiskPercent ?? "",
	dailyLossValue: rules?.dailyLoss?.value ?? "",
	dailyLossUnit: rules?.dailyLoss?.unit ?? DailyLossUnit.Amount,
	tradesPerDay: rules?.maxTradesPerDay?.toString() ?? "",
	cooldownAfterLosses: rules?.cooldown?.afterLosses.toString() ?? "1",
	cooldownMinutes: rules?.cooldown?.minutes.toString() ?? "",
});

const filled = (value: string) => value.trim() || undefined;

function toInput(form: RulesForm) {
	return riskRulesInputSchema.safeParse({
		maxTradeRiskAmount: filled(form.tradeRiskAmount),
		maxTradeRiskPercent: filled(form.tradeRiskPercent),
		dailyLoss: filled(form.dailyLossValue) && {
			unit: form.dailyLossUnit,
			value: form.dailyLossValue.trim(),
		},
		maxTradesPerDay: filled(form.tradesPerDay) && Number(form.tradesPerDay),
		cooldown: filled(form.cooldownMinutes) && {
			afterLosses: Number(form.cooldownAfterLosses || 1),
			minutes: Number(form.cooldownMinutes),
		},
	});
}

const formatSince = (date: Date, timeZone: string) =>
	new Intl.DateTimeFormat("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone,
	}).format(new Date(date));

export function RiskRulesSettings() {
	const { activeAccount } = useAccounts();
	const { data: session } = authClient.useSession();
	const portfolioId = activeAccount?.id;
	const rules = useQuery({
		queryKey: [QueryKey.RiskRules, session?.user.id, portfolioId],
		queryFn: () =>
			getRiskRules({ data: { portfolioId: portfolioId as number } }),
		enabled: !!session?.user.id && portfolioId !== undefined,
	});
	if (!activeAccount) return null;
	return (
		<section className="surface mt-6 space-y-4 p-5">
			<SectionHeading
				title="Risk and discipline rules"
				detail={activeAccount.name}
			/>
			<RulesBody
				state={rules.data}
				isError={rules.isError}
				onRetry={() => rules.refetch()}
				portfolioId={activeAccount.id}
				currency={activeAccount.currency}
			/>
			<p role="note" className="text-xs text-muted-foreground">
				{RULES_DISCLAIMER}
			</p>
		</section>
	);
}

function RulesBody({
	state,
	isError,
	onRetry,
	portfolioId,
	currency,
}: {
	state: RiskRulesState | undefined;
	isError: boolean;
	onRetry: () => void;
	portfolioId: number;
	currency: string | null;
}) {
	if (isError)
		return (
			<p role="alert" className="text-sm">
				Rules could not be loaded.{" "}
				<Button variant="outline" size="sm" onClick={onRetry}>
					Retry
				</Button>
			</p>
		);
	if (!state)
		return <p className="text-sm text-muted-foreground">Loading rules...</p>;
	if (!state.reviewTimezone)
		return (
			<p className="text-sm">
				Choose your review timezone first. Rules use it to find the end of a
				day.
			</p>
		);
	return (
		<RulesEditor
			key={portfolioId}
			state={state}
			reviewTimezone={state.reviewTimezone}
			portfolioId={portfolioId}
			currency={currency ?? ""}
		/>
	);
}

function RulesEditor({
	state: { current },
	reviewTimezone,
	portfolioId,
	currency,
}: {
	state: RiskRulesState;
	reviewTimezone: string;
	portfolioId: number;
	currency: string;
}) {
	const [form, setForm] = useState(() => toForm(current?.rules));
	const [invalid, setInvalid] = useState<string>();
	const [result, setResult] = useState<string>();
	const queryClient = useQueryClient();
	const set = (key: keyof RulesForm) => (value: string) => {
		setForm((previous) => ({ ...previous, [key]: value }));
		setResult(undefined);
	};
	const mutation = useMutation({
		mutationFn: (rules: RiskRulesInput | null) =>
			rules
				? saveRiskRules({ data: { portfolioId, rules } })
				: clearRiskRules({ data: { portfolioId } }),
		onSuccess: ({ saved }, rules) => {
			if (!rules) setForm(EMPTY_FORM);
			if (!saved) setResult("No change. Nothing was saved.");
			else setResult(rules ? "Rules saved." : "Rules cleared.");
			return invalidateRiskRuleQueries(queryClient);
		},
	});
	const save = () => {
		const parsed = toInput(form);
		setInvalid(parsed.success ? undefined : parsed.error.issues[0].message);
		if (parsed.success) mutation.mutate(parsed.data);
	};
	const error = invalid ?? (mutation.isError ? mutation.error.message : null);

	return (
		<form
			className="space-y-4"
			onSubmit={(event) => {
				event.preventDefault();
				save();
			}}
		>
			{!hasRiskRules(current?.rules ?? {}) && (
				<p className="text-sm text-muted-foreground">
					Set the limits you want to check. Each one is optional.
				</p>
			)}
			{current && current.timezone !== reviewTimezone && (
				<p className="text-sm">
					Rules use {current.timezone}. Your review timezone is now{" "}
					{reviewTimezone}. Save the rules to use it.
				</p>
			)}
			<div className="grid gap-4 sm:grid-cols-2">
				<RuleGroup title="Risk per trade">
					<NumberField
						label={`Max risk per trade (${currency})`}
						value={form.tradeRiskAmount}
						onChange={set("tradeRiskAmount")}
					/>
					<NumberField
						label="Max risk per trade (% of balance at entry)"
						value={form.tradeRiskPercent}
						onChange={set("tradeRiskPercent")}
					/>
				</RuleGroup>
				<DailyLossGroup form={form} currency={currency} set={set} />
				<RuleGroup title="Trades per day">
					<NumberField
						label="Max trades per day"
						value={form.tradesPerDay}
						onChange={set("tradesPerDay")}
						integer
					/>
				</RuleGroup>
				<RuleGroup title="Cooldown">
					<NumberField
						label="Losing trades in a row"
						value={form.cooldownAfterLosses}
						onChange={set("cooldownAfterLosses")}
						integer
					/>
					<NumberField
						label="Wait (minutes)"
						value={form.cooldownMinutes}
						onChange={set("cooldownMinutes")}
						integer
					/>
				</RuleGroup>
			</div>
			{current && (
				<p className="text-xs text-muted-foreground">
					Version {current.version} · since{" "}
					{formatSince(current.effectiveFrom, current.timezone)} · days end at
					midnight {current.timezone}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="submit"
					className="max-sm:h-11"
					disabled={mutation.isPending}
				>
					{mutation.isPending ? "Saving..." : "Save rules"}
				</Button>
				{current && hasRiskRules(current.rules) && (
					<Button
						type="button"
						variant="outline"
						className="max-sm:h-11"
						disabled={mutation.isPending}
						onClick={() => mutation.mutate(null)}
					>
						Clear rules
					</Button>
				)}
				<output className="text-sm text-muted-foreground">{result}</output>
			</div>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
		</form>
	);
}

function DailyLossGroup({
	form,
	currency,
	set,
}: {
	form: RulesForm;
	currency: string;
	set: (key: keyof RulesForm) => (value: string) => void;
}) {
	const unitId = useId();
	return (
		<RuleGroup title="Daily loss">
			<NumberField
				label="Daily loss limit"
				value={form.dailyLossValue}
				onChange={set("dailyLossValue")}
			/>
			<label className="block text-sm" htmlFor={unitId}>
				Daily loss unit
			</label>
			<select
				id={unitId}
				className="h-11 w-full rounded-md border bg-background px-2 text-sm sm:h-9"
				value={form.dailyLossUnit}
				onChange={(event) => set("dailyLossUnit")(event.target.value)}
			>
				<option value={DailyLossUnit.Amount}>Amount ({currency})</option>
				<option value={DailyLossUnit.BalancePercent}>
					% of day-start balance
				</option>
			</select>
			{form.dailyLossUnit === DailyLossUnit.BalancePercent && (
				<p className="text-xs text-muted-foreground">
					The day-start balance is deposits, withdrawals, adjustments and
					realized P&L before the day starts. When it is not known, the check
					shows Unknown.
				</p>
			)}
		</RuleGroup>
	);
}

function RuleGroup({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<fieldset className="space-y-2 rounded-md border p-3">
			<legend className="px-1 text-sm font-medium">{title}</legend>
			{children}
		</fieldset>
	);
}

function NumberField({
	label,
	value,
	onChange,
	integer = false,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	integer?: boolean;
}) {
	const id = useId();
	return (
		<div className="space-y-1">
			<label className="block text-sm" htmlFor={id}>
				{label}
			</label>
			<Input
				id={id}
				className="h-11 sm:h-9"
				inputMode={integer ? "numeric" : "decimal"}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}
