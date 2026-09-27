import type { ReactNode } from "react";
import { MetricLabel } from "@/components/metric-label";
import {
	MIN_SHARPE_DAYS,
	type PayoffRatio,
	type SharpeResult,
} from "@/lib/analytics";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";

export interface RiskMetricsData {
	sharpe: SharpeResult;
	maxDrawdown: { dollars: number; percent: number | null };
	payoff: PayoffRatio;
	avgHoldTimeHours: number | null;
	closedTrades: number;
}

interface RiskMetricsProps {
	metrics: RiskMetricsData;
	currency?: string;
}

const UNAVAILABLE = "—";

function MetricCard({
	label,
	definition,
	value,
	sub,
}: {
	label: string;
	definition: ReactNode;
	value: string;
	sub: string;
}) {
	return (
		<div className="surface p-4">
			<MetricLabel label={label}>{definition}</MetricLabel>
			<p className="metric-value mt-1">{value}</p>
			<p className="mt-1 text-xs text-muted-foreground">{sub}</p>
		</div>
	);
}

function formatHold(hours: number): string {
	if (hours < 1) return `${Math.round(hours * 60)}m`;
	if (hours < 24) return `${Math.round(hours)}h`;
	return `${Math.round(hours / 24)}d`;
}

function sharpeSub({ value, days }: SharpeResult): string {
	if (value !== null) return `${days} trading days · annualized`;
	if (days < MIN_SHARPE_DAYS)
		return `Needs ${MIN_SHARPE_DAYS} trading days · ${days} so far`;
	return "Daily returns do not vary";
}

export function RiskMetrics({
	metrics,
	currency = DEFAULT_CURRENCY,
}: RiskMetricsProps) {
	const { sharpe, maxDrawdown, payoff, avgHoldTimeHours, closedTrades } =
		metrics;
	const money = (value: number) =>
		formatMoney(value, currency, { maximumFractionDigits: 0 });

	let drawdownSub = "No drawdown in this period";
	if (maxDrawdown.dollars > 0) {
		drawdownSub =
			maxDrawdown.percent === null
				? "Peak balance was not positive"
				: `${maxDrawdown.percent.toFixed(1)}% from peak`;
	}

	return (
		<div className="metric-row grid-cols-2 md:grid-cols-4">
			<MetricCard
				label="Sharpe (realized)"
				value={sharpe.value === null ? UNAVAILABLE : sharpe.value.toFixed(2)}
				sub={sharpeSub(sharpe)}
				definition={
					<>
						<p>
							{
								"Mean daily return over its standard deviation, times √252. A day's return is its trading P&L over the balance at the start of that day."
							}
						</p>
						<p>
							{`Idle weekdays count as zero. Only closed trades count; open positions are not marked to market. Shown from ${MIN_SHARPE_DAYS} trading days.`}
						</p>
					</>
				}
			/>
			<MetricCard
				label="Max drawdown"
				value={money(-maxDrawdown.dollars || 0)}
				sub={drawdownSub}
				definition={
					<>
						<p>
							{
								"Largest fall in trading P&L from an earlier high in this period."
							}
						</p>
						<p>
							Deposits and withdrawals move the high with the balance, so they
							never count as a drawdown. The percent divides by the balance at
							the high.
						</p>
					</>
				}
			/>
			<MetricCard
				label="Payoff ratio"
				value={payoff.ratio === null ? UNAVAILABLE : payoff.ratio.toFixed(2)}
				sub={
					payoff.avgWin !== null && payoff.avgLoss !== null
						? `Avg win ${money(payoff.avgWin)} ÷ avg loss ${money(payoff.avgLoss)}`
						: `Needs a win and a loss · ${payoff.wins}W / ${payoff.losses}L`
				}
				definition={
					<>
						<p>
							Average winning trade over the average losing trade. Breakeven
							trades are left out.
						</p>
						<p>
							It is not reward to risk: the journal does not record a stop at
							entry, so R-multiples are not available.
						</p>
					</>
				}
			/>
			<MetricCard
				label="Avg hold time"
				value={
					avgHoldTimeHours === null ? UNAVAILABLE : formatHold(avgHoldTimeHours)
				}
				sub={
					closedTrades > 0
						? `Entry to exit · ${closedTrades} trades`
						: "No closed trades"
				}
				definition={
					<p>
						Mean time from entry to exit of the closed trades in this period.
					</p>
				}
			/>
		</div>
	);
}
