interface RiskMetricsProps {
	sharpe: number;
	maxDrawdown: { dollars: number; percent: number };
	avgRR: number;
	avgHoldTimeHours: number;
}

function MetricCard({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<p className="text-xs text-muted-foreground mb-1">{label}</p>
			<p className="text-2xl font-bold text-foreground">{value}</p>
			{sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
		</div>
	);
}

export function RiskMetrics({
	sharpe,
	maxDrawdown,
	avgRR,
	avgHoldTimeHours,
}: RiskMetricsProps) {
	const hours = Math.round(avgHoldTimeHours);
	const holdStr = hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;

	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
			<MetricCard
				label="Sharpe Ratio"
				value={sharpe.toFixed(2)}
				sub="Annualized (252d)"
			/>
			<MetricCard
				label="Max Drawdown"
				value={`-$${maxDrawdown.dollars.toFixed(0)}`}
				sub={`${maxDrawdown.percent.toFixed(1)}% peak-to-trough`}
			/>
			<MetricCard label="Avg Risk/Reward" value={`${avgRR.toFixed(2)}x`} />
			<MetricCard label="Avg Hold Time" value={holdStr} />
		</div>
	);
}
