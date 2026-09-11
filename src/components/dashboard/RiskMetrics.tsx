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
		<div className="surface p-4">
			<p className="field-label">{label}</p>
			<p className="metric-value mt-1">{value}</p>
			{sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
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
		<div className="metric-row grid-cols-2 md:grid-cols-4">
			<MetricCard
				label="Sharpe ratio"
				value={sharpe.toFixed(2)}
				sub="Annualized (252d)"
			/>
			<MetricCard
				label="Max drawdown"
				value={`-$${maxDrawdown.dollars.toFixed(0)}`}
				sub={`${maxDrawdown.percent.toFixed(1)}% peak-to-trough`}
			/>
			<MetricCard
				label="Avg risk/reward"
				value={`${avgRR.toFixed(2)}x`}
				sub="Reward per unit risked"
			/>
			<MetricCard label="Avg hold time" value={holdStr} sub="Entry to exit" />
		</div>
	);
}
