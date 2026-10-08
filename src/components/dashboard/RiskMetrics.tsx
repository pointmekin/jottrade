import { MetricCard } from "@/components/metric-card";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { UNAVAILABLE } from "@/lib/metric";
import {
	type Drawdown,
	MIN_SHARPE_DAYS,
	type PayoffRatio,
	type SharpeResult,
} from "@/lib/risk-metrics";

export interface RiskMetricsData {
	sharpe: SharpeResult;
	maxDrawdown: Drawdown;
	payoff: PayoffRatio;
	avgHoldTimeHours: number | null;
	closedTrades: number;
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

function drawdownSub({ dollars, percent }: Drawdown): string {
	if (dollars <= 0) return "No drawdown in this period";
	if (percent === null) return "Peak balance was not positive";
	return `${percent.toFixed(1)}% from peak`;
}

export function RiskMetrics({
	metrics,
	isAccountWide,
}: {
	metrics: RiskMetricsData;
	isAccountWide?: boolean;
}) {
	const currency = useCurrency();
	const accountWide = (sub: string) =>
		isAccountWide ? `Account-wide · ${sub}` : sub;
	const { sharpe, maxDrawdown, payoff, avgHoldTimeHours, closedTrades } =
		metrics;
	const money = (value: number) =>
		formatMoney(value, currency, { maximumFractionDigits: 0 });

	return (
		<div className="metric-row grid-cols-2 md:grid-cols-4">
			<MetricCard
				label="Sharpe (realized)"
				value={sharpe.value?.toFixed(2) ?? UNAVAILABLE}
				sub={accountWide(sharpeSub(sharpe))}
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
				sub={accountWide(drawdownSub(maxDrawdown))}
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
				value={payoff.ratio?.toFixed(2) ?? UNAVAILABLE}
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
							It compares average outcomes. Original planned reward/risk and
							realized net R are shown separately on trade details when an
							initial plan is available.
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
