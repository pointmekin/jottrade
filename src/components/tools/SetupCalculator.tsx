import { Calculator, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useCurrency } from "@/hooks/use-currency";
import { currencySymbol, formatMoney } from "@/lib/currency";
import { type PositionSizingResult, sizePosition } from "@/lib/position-sizing";
import { getCurrentFxRate } from "@/server/positionSizingActions";

const numberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 4,
});

function conversionSource(result: PositionSizingResult) {
	if (result.conversion?.type !== "CURRENT_RATE") return null;
	return result.conversion.provider === "frankfurter"
		? "Frankfurter daily reference rate"
		: "Twelve Data";
}

export function SetupCalculator({
	initialBalance = 0,
}: {
	initialBalance?: number;
}) {
	const currency = useCurrency();
	const [symbol, setSymbol] = useState("");
	const [balance, setBalance] = useState(
		() => Math.round(initialBalance * 100) / 100,
	);
	const [riskPercent, setRiskPercent] = useState(1.0);
	const [entryPrice, setEntryPrice] = useState("");
	const [stopLoss, setStopLoss] = useState("");
	const [targetPrice, setTargetPrice] = useState("");
	const [results, setResults] = useState<PositionSizingResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isCalculating, setIsCalculating] = useState(false);
	const symbolId = useId();
	const balanceId = useId();
	const entryId = useId();
	const stopLossId = useId();
	const targetId = useId();
	const riskId = useId();

	const invalidateResult = () => {
		setResults(null);
		setError(null);
	};

	const calculate = async () => {
		setIsCalculating(true);
		setError(null);
		try {
			const result = await sizePosition(
				{
					symbol,
					accountCurrency: currency,
					balance,
					riskPercent,
					entryPrice: Number(entryPrice),
					stopPrice: Number(stopLoss),
					targetPrice: targetPrice.trim() ? Number(targetPrice) : undefined,
				},
				(input) => getCurrentFxRate({ data: input }),
			);
			setResults(result);
		} catch (cause) {
			setResults(null);
			setError(
				cause instanceof Error
					? cause.message
					: "The position size could not be calculated.",
			);
		} finally {
			setIsCalculating(false);
		}
	};

	const clear = () => {
		setSymbol("");
		setEntryPrice("");
		setStopLoss("");
		setTargetPrice("");
		invalidateResult();
	};

	const source = results ? conversionSource(results) : null;

	return (
		<Card className="w-full gap-4 py-5">
			<CardHeader className="px-5">
				<CardTitle className="flex items-center gap-2 text-base">
					<Calculator className="size-4 text-muted-foreground" />
					Position size
				</CardTitle>
				<CardDescription>
					Calculate risk, forex lots or units, and R:R ratio.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5 px-5">
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
					<div className="grid gap-2">
						<Label htmlFor={symbolId}>Symbol</Label>
						<Input
							id={symbolId}
							placeholder="EURUSD"
							value={symbol}
							className="uppercase"
							disabled={isCalculating}
							onChange={(event) => {
								setSymbol(event.target.value);
								invalidateResult();
							}}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={balanceId}>
							Account balance ({currencySymbol(currency)} {currency})
						</Label>
						<Input
							id={balanceId}
							type="number"
							value={balance}
							disabled={isCalculating}
							onChange={(event) => {
								setBalance(Number(event.target.value));
								invalidateResult();
							}}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={entryId}>Entry price</Label>
						<Input
							id={entryId}
							type="number"
							step="any"
							placeholder="0.00"
							value={entryPrice}
							disabled={isCalculating}
							onChange={(event) => {
								setEntryPrice(event.target.value);
								invalidateResult();
							}}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={stopLossId}>Stop loss</Label>
						<Input
							id={stopLossId}
							type="number"
							step="any"
							placeholder="0.00"
							value={stopLoss}
							disabled={isCalculating}
							onChange={(event) => {
								setStopLoss(event.target.value);
								invalidateResult();
							}}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={targetId}>Target price (optional)</Label>
						<Input
							id={targetId}
							type="number"
							step="any"
							placeholder="0.00"
							value={targetPrice}
							disabled={isCalculating}
							onChange={(event) => {
								setTargetPrice(event.target.value);
								invalidateResult();
							}}
						/>
					</div>
				</div>

				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="grid min-w-64 flex-1 gap-2 sm:max-w-sm">
						<div className="flex items-center justify-between">
							<Label htmlFor={riskId}>Risk percentage</Label>
							<span className="font-data text-sm font-medium">
								{riskPercent}%
							</span>
						</div>
						<Slider
							id={riskId}
							value={[riskPercent]}
							onValueChange={(value: number[]) => {
								setRiskPercent(value[0]);
								invalidateResult();
							}}
							max={5}
							step={0.1}
							disabled={isCalculating}
							className="py-2"
						/>
					</div>
					<div className="flex gap-2">
						<Button type="button" onClick={calculate} disabled={isCalculating}>
							{isCalculating ? "Calculating…" : "Calculate"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={clear}
							disabled={isCalculating}
							className="text-muted-foreground hover:text-foreground"
						>
							<RotateCcw className="size-4" /> Reset
						</Button>
					</div>
				</div>

				<div
					className="space-y-4 border-t border-border pt-4"
					aria-live="polite"
				>
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
					{results ? (
						<>
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
								<Result label="Risk amount">
									<span className="text-destructive">
										{formatMoney(results.riskAmount, currency)}
									</span>
								</Result>
								<Result label="Position size">
									{numberFormatter.format(results.positionSize)}{" "}
									<span className="text-xs font-normal text-muted-foreground">
										{results.quantityUnit === "LOTS" ? "lots" : "units"}
									</span>
								</Result>
								<Result label="Stop distance">
									{results.stopDistancePips === null
										? numberFormatter.format(results.stopDistance)
										: `${numberFormatter.format(results.stopDistancePips)} pips`}
									{results.quantityUnit === "LOTS" && (
										<span className="mt-1 block text-xs font-normal text-muted-foreground">
											{numberFormatter.format(results.positionUnits)} units
										</span>
									)}
								</Result>
								<Result label="R:R ratio">
									{results.rrRatio === null
										? "—"
										: `1:${results.rrRatio.toFixed(2)}`}
								</Result>
							</div>
							{results.conversion?.type === "CURRENT_RATE" && source && (
								<p className="text-sm text-muted-foreground">
									Estimated using current {results.conversion.fromCurrency} →{" "}
									{results.conversion.toCurrency} conversion rate · {source}
								</p>
							)}
						</>
					) : (
						!error && (
							<p className="py-2 text-sm text-muted-foreground">
								Enter a symbol, entry price, and stop loss, then calculate.
							</p>
						)
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function Result({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="surface min-w-0 p-3">
			<p className="field-label">{label}</p>
			<p className="mt-1 break-words font-data text-lg font-semibold tabular-nums">
				{children}
			</p>
		</div>
	);
}
