import { Calculator, RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";
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

export function SetupCalculator({
	initialBalance = 0,
}: {
	initialBalance?: number;
}) {
	const currency = useCurrency();
	const [balance, setBalance] = useState(
		() => Math.round(initialBalance * 100) / 100,
	);
	const [riskPercent, setRiskPercent] = useState(1.0);
	const [entryPrice, setEntryPrice] = useState<string>("");
	const [stopLoss, setStopLoss] = useState<string>("");
	const [targetPrice, setTargetPrice] = useState<string>("");
	const balanceId = useId();
	const entryId = useId();
	const stopLossId = useId();
	const targetId = useId();

	const results = useMemo<{
		riskAmount: number;
		positionSize: number;
		rrRatio: number | null;
	} | null>(() => {
		const entry = parseFloat(entryPrice);
		const sl = parseFloat(stopLoss);
		const tp = parseFloat(targetPrice);

		if (Number.isNaN(entry) || Number.isNaN(sl) || entry === sl) {
			return null;
		}

		const riskAmount = balance * (riskPercent / 100);
		const slDist = Math.abs(entry - sl);
		const positionSize = riskAmount / slDist;

		let rrRatio = null;
		if (!Number.isNaN(tp)) {
			const rewardDist = Math.abs(tp - entry);
			rrRatio = rewardDist / slDist;
		}

		return {
			riskAmount,
			positionSize,
			rrRatio,
		};
	}, [balance, entryPrice, riskPercent, stopLoss, targetPrice]);

	const clear = () => {
		setEntryPrice("");
		setStopLoss("");
		setTargetPrice("");
	};

	return (
		<Card className="w-full gap-4 py-5">
			<CardHeader className="px-5">
				<CardTitle className="flex items-center gap-2 text-base">
					<Calculator className="size-4 text-muted-foreground" />
					Position size
				</CardTitle>
				<CardDescription>
					Calculate risk, position size, and R:R ratio.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5 px-5">
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<div className="grid gap-2">
						<Label htmlFor={balanceId}>
							Account balance ({currencySymbol(currency)} {currency})
						</Label>
						<Input
							id={balanceId}
							type="number"
							value={balance}
							onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={entryId}>Entry price</Label>
						<Input
							id={entryId}
							type="number"
							placeholder="0.00"
							value={entryPrice}
							onChange={(e) => setEntryPrice(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={stopLossId}>Stop loss</Label>
						<Input
							id={stopLossId}
							type="number"
							placeholder="0.00"
							value={stopLoss}
							onChange={(e) => setStopLoss(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={targetId}>Target price (optional)</Label>
						<Input
							id={targetId}
							type="number"
							placeholder="0.00"
							value={targetPrice}
							onChange={(e) => setTargetPrice(e.target.value)}
						/>
					</div>
				</div>

				<div className="grid gap-2 sm:max-w-sm">
					<div className="flex items-center justify-between">
						<Label htmlFor="risk">Risk percentage</Label>
						<span className="font-data text-sm font-medium">
							{riskPercent}%
						</span>
					</div>
					<Slider
						value={[riskPercent]}
						onValueChange={(v: number[]) => setRiskPercent(v[0])}
						max={5}
						step={0.1}
						className="py-2"
					/>
				</div>

				<div className="space-y-4 border-t border-border pt-4">
					{results ? (
						<div className="grid gap-4 sm:grid-cols-3">
							<div className="surface p-3">
								<p className="field-label">Risk amount</p>
								<p className="mt-1 font-data text-lg font-semibold text-destructive">
									{formatMoney(results.riskAmount, currency)}
								</p>
							</div>
							<div className="surface p-3">
								<p className="field-label">Position size</p>
								<p className="mt-1 font-data text-lg font-semibold">
									{results.positionSize.toFixed(4)}{" "}
									<span className="text-xs font-normal text-muted-foreground">
										units
									</span>
								</p>
							</div>
							<div className="surface flex items-center justify-between gap-3 p-3">
								<div>
									<p className="field-label">R:R ratio</p>
									<p
										className={`mt-1 font-data text-lg font-semibold ${results.rrRatio && results.rrRatio >= 2 ? "text-success" : "text-foreground"}`}
									>
										{results.rrRatio ? `1:${results.rrRatio.toFixed(2)}` : "-"}
									</p>
								</div>
								{results.rrRatio && results.rrRatio >= 2 && (
									<span className="status-pill bg-success/10 text-success">
										Good setup
									</span>
								)}
							</div>
						</div>
					) : (
						<p className="py-2 text-sm text-muted-foreground">
							Enter an entry price and stop loss to see results.
						</p>
					)}

					<Button
						variant="ghost"
						size="sm"
						onClick={clear}
						className="text-muted-foreground hover:text-foreground"
					>
						<RotateCcw className="size-4" /> Reset
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
