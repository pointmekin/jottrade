import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { useId, useState } from "react";
import { LogTradeDrawer } from "@/components/journal/log-trade-drawer";
import { RiskFields } from "@/components/journal/trade-risk-fields";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/use-accounts";
import { toDateTimeLocalValue } from "@/lib/date";
import { QueryKey } from "@/lib/query-keys";
import { TradeSide } from "@/lib/trade";
import type { TradeCaptureValues } from "@/lib/trade-capture";
import { calculatePositionSize } from "@/lib/trade-risk";
import { RiskCaptureSource } from "@/lib/trade-risk-schema";
import { getAnalytics } from "@/server/getAnalytics";

export function SetupCalculator() {
	const { activeAccount } = useAccounts();
	if (!activeAccount) return null;
	return <CalculatorInputs key={activeAccount.id} />;
}

function CalculatorInputs() {
	const { activeAccount } = useAccounts();
	const id = useId();
	const [balanceOverride, setBalanceOverride] = useState<string>();
	const [riskPercent, setRiskPercent] = useState("1");
	const [draft, setDraft] = useState<TradeCaptureValues>({
		symbol: "",
		side: TradeSide.Long,
		entryPrice: "",
		quantity: "",
		entryDate: toDateTimeLocalValue(new Date()),
		initialStopPrice: "",
		targetPrice: "",
		entryQuoteToAccountRate: "",
		confirmedUnitQuoteCurrency: "",
		captureSource: RiskCaptureSource.Calculator,
	});
	const range = {
		portfolioId: activeAccount?.id ?? 0,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	};
	const balanceQuery = useQuery({
		queryKey: [QueryKey.Analytics, range],
		queryFn: () => getAnalytics({ data: range }),
		enabled: Boolean(activeAccount),
	});
	const balance =
		balanceOverride ?? String(balanceQuery.data?.stats.totalBalance ?? "");
	let quantity: string | null = null;
	let error: string | undefined;
	try {
		quantity = calculatePositionSize(
			{
				...draft,
				accountCurrency: activeAccount?.currency ?? "USD",
				balanceAccount: balance,
			},
			(Number(balance) * Number(riskPercent)) / 100,
		);
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "Risk unavailable";
	}
	const values = {
		...draft,
		quantity: quantity ?? "",
		balanceAccount: balance,
	};
	return (
		<Card className="w-full gap-4 py-5">
			<CardHeader className="px-5">
				<CardTitle className="flex items-center gap-2 text-base">
					<Calculator className="size-4" />
					Position size
				</CardTitle>
				<CardDescription>
					Plan theoretical lots or units, then review the trade before saving.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4 px-5">
				<p className="text-sm">
					{activeAccount?.name} · {activeAccount?.currency}. Balance suggestion
					uses all recorded history.
				</p>
				<div className="grid gap-3 sm:grid-cols-2">
					{(
						[
							["symbol", "Symbol"],
							["entryPrice", "Entry price"],
							["targetPrice", "Initial target price"],
						] as const
					).map(([name, label]) => (
						<div key={name} className="space-y-1.5">
							<Label htmlFor={`${id}-${name}`}>{label}</Label>
							<Input
								id={`${id}-${name}`}
								value={draft[name] ?? ""}
								onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
							/>
						</div>
					))}
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-side`}>Side</Label>
						<select
							id={`${id}-side`}
							className="h-9 w-full rounded-md border border-input bg-background px-3"
							value={draft.side}
							onChange={(e) =>
								setDraft({
									...draft,
									side:
										e.target.value === TradeSide.Short
											? TradeSide.Short
											: TradeSide.Long,
								})
							}
						>
							<option value={TradeSide.Long}>Long</option>
							<option value={TradeSide.Short}>Short</option>
						</select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-percent`}>Requested risk %</Label>
						<Input
							id={`${id}-percent`}
							type="number"
							step="any"
							min="0"
							value={riskPercent}
							onChange={(e) => setRiskPercent(e.target.value)}
						/>
					</div>
				</div>
				<RiskFields
					values={values}
					currency={activeAccount?.currency ?? "USD"}
					onChange={(patch) => {
						if (patch.balanceAccount !== undefined)
							setBalanceOverride(patch.balanceAccount);
						setDraft({ ...draft, ...patch });
					}}
				/>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				{quantity && (
					<p className="font-data">
						Suggested quantity: {quantity}. Confirm your broker quantity step in
						the entry form.
					</p>
				)}
				<LogTradeDrawer
					defaultOpen={false}
					initialDraft={{ ...values, portfolioId: activeAccount?.id ?? 0 }}
					trigger="Use in trade"
					disabled={quantity === null || !activeAccount}
				/>
			</CardContent>
		</Card>
	);
}
