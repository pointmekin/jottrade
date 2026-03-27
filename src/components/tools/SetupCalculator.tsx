import { useState, useEffect } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";

export function SetupCalculator({
	initialBalance = 10000,
}: {
	initialBalance?: number;
}) {
	const [balance, setBalance] = useState(initialBalance);
	const [riskPercent, setRiskPercent] = useState(1.0);
	const [entryPrice, setEntryPrice] = useState<string>("");
	const [stopLoss, setStopLoss] = useState<string>("");
	const [targetPrice, setTargetPrice] = useState<string>("");

	const [results, setResults] = useState<{
		riskAmount: number;
		positionSize: number;
		rrRatio: number | null;
	} | null>(null);

	useEffect(() => {
		calculate();
	}, [balance, riskPercent, entryPrice, stopLoss, targetPrice]);

	const calculate = () => {
		const entry = parseFloat(entryPrice);
		const sl = parseFloat(stopLoss);
		const tp = parseFloat(targetPrice);

		if (isNaN(entry) || isNaN(sl) || entry === sl) {
			setResults(null);
			return;
		}

		const riskAmount = balance * (riskPercent / 100);
		const slDist = Math.abs(entry - sl);
		const positionSize = riskAmount / slDist;

		let rrRatio = null;
		if (!isNaN(tp)) {
			const rewardDist = Math.abs(tp - entry);
			rrRatio = rewardDist / slDist;
		}

		setResults({
			riskAmount,
			positionSize,
			rrRatio,
		});
	};

	const clear = () => {
		setEntryPrice("");
		setStopLoss("");
		setTargetPrice("");
	};

	return (
		<Card className="w-full h-full bg-background/50 border-border">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Calculator className="h-5 w-5 text-primary" />
					Position Size Calculator
				</CardTitle>
				<CardDescription>
					Calculate risk, position size, and R:R ratio.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-4">
					<div className="grid gap-2">
						<Label htmlFor="balance">Account Balance</Label>
						<Input
							id="balance"
							type="number"
							value={balance}
							onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
							className="bg-background/50 border-input"
						/>
					</div>

					<div className="grid gap-2">
						<div className="flex justify-between">
							<Label htmlFor="risk">Risk Percentage</Label>
							<span className="text-sm text-foreground font-medium">
								{riskPercent}%
							</span>
						</div>
						<Slider
							value={[riskPercent]}
							onValueChange={(v: number[]) => setRiskPercent(v[0])}
							max={5}
							step={0.1}
							className="py-4"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="grid gap-2">
							<Label htmlFor="entry">Entry Price</Label>
							<Input
								id="entry"
								type="number"
								placeholder="0.00"
								value={entryPrice}
								onChange={(e) => setEntryPrice(e.target.value)}
								className="bg-background/50 border-input"
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="stopLoss">Stop Loss</Label>
							<Input
								id="stopLoss"
								type="number"
								placeholder="0.00"
								value={stopLoss}
								onChange={(e) => setStopLoss(e.target.value)}
								className="bg-background/50 border-input"
							/>
						</div>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="target">Target Price (Optional)</Label>
						<Input
							id="target"
							type="number"
							placeholder="0.00"
							value={targetPrice}
							onChange={(e) => setTargetPrice(e.target.value)}
							className="bg-background/50 border-input"
						/>
					</div>
				</div>

				<div className="pt-4 border-t border-border space-y-4">
					{results ? (
						<div className="grid grid-cols-2 gap-4">
							<div className="bg-muted/30 p-3 rounded-lg">
								<p className="text-xs text-muted-foreground">Risk Amount</p>
								<p className="text-lg font-bold text-destructive">
									{new Intl.NumberFormat("en-US", {
										style: "currency",
										currency: "USD",
									}).format(results.riskAmount)}
								</p>
							</div>
							<div className="bg-muted/30 p-3 rounded-lg">
								<p className="text-xs text-muted-foreground">Position Size</p>
								<p className="text-lg font-bold text-primary">
									{results.positionSize.toFixed(4)}{" "}
									<span className="text-xs font-normal text-muted-foreground">
										Units
									</span>
								</p>
							</div>
							<div className="col-span-2 bg-muted/30 p-3 rounded-lg flex justify-between items-center">
								<div className="text-left">
									<p className="text-xs text-muted-foreground">R:R Ratio</p>
									<p
										className={`text-lg font-bold ${results.rrRatio && results.rrRatio >= 2 ? "text-green-500" : "text-foreground"}`}
									>
										{results.rrRatio ? `1:${results.rrRatio.toFixed(2)}` : "-"}
									</p>
								</div>
								{results.rrRatio && results.rrRatio >= 2 && (
									<span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded">
										Good Setup
									</span>
								)}
							</div>
						</div>
					) : (
						<div className="text-center text-sm text-muted-foreground py-4">
							Enter prices to see results
						</div>
					)}

					<Button
						variant="ghost"
						size="sm"
						onClick={clear}
						className="w-full text-muted-foreground hover:text-foreground"
					>
						<RotateCcw className="h-4 w-4 mr-2" /> Reset
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
