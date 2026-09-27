import { MetricCard, MetricCardSkeleton } from "@/components/metric-card";
import { useCurrency } from "@/hooks/use-currency";
import type { TradeStats } from "@/lib/analytics";
import { formatMoney } from "@/lib/currency";
import { MetricVariant, toneOf, UNAVAILABLE } from "@/lib/metric";

const CELLS = ["balance", "pnl", "win-rate", "positions"];

export function AccountSummarySkeleton() {
	return (
		<div className="metric-row mt-4 grid-cols-2 lg:grid-cols-4">
			{CELLS.map((key) => (
				<MetricCardSkeleton key={key} variant={MetricVariant.Cell} />
			))}
		</div>
	);
}

function winRateSub(stats: TradeStats) {
	const scratch =
		stats.breakevenTrades > 0 ? ` / ${stats.breakevenTrades} scratch` : "";
	const profitFactor = stats.profitFactor?.toFixed(2) ?? UNAVAILABLE;
	return `${stats.winningTrades}W / ${stats.losingTrades}L${scratch} · PF ${profitFactor}`;
}

export function AccountSummary({
	stats,
	isAllTime,
}: {
	stats: TradeStats;
	isAllTime: boolean;
}) {
	const currency = useCurrency();

	return (
		<section
			className="metric-row mt-4 grid-cols-2 lg:grid-cols-4"
			aria-label="Account summary"
		>
			<MetricCard
				variant={MetricVariant.Cell}
				label="Account balance"
				value={formatMoney(stats.totalBalance, currency)}
				sub={
					isAllTime
						? `Deposits ${formatMoney(stats.netDeposits, currency, { signed: true })}`
						: `Opened at ${formatMoney(stats.openingBalance, currency)}`
				}
				definition={
					<p>
						{
							"Deposits minus withdrawals, plus trading P&L and broker adjustments, up to the end of the period."
						}
					</p>
				}
			/>
			<MetricCard
				variant={MetricVariant.Cell}
				label="Net P&L"
				value={formatMoney(stats.totalPnL, currency, { signed: true })}
				tone={toneOf(stats.totalPnL)}
				sub={`Across ${stats.totalTrades} trades`}
				definition={
					<>
						<p>
							{
								"Net P&L of trades closed in the period, plus broker adjustments such as swaps and dividends."
							}
						</p>
						<p>
							Deposits and withdrawals are not profit. They change the balance
							only.
						</p>
					</>
				}
			/>
			<MetricCard
				variant={MetricVariant.Cell}
				label="Win rate"
				value={
					stats.winRate === null ? UNAVAILABLE : `${stats.winRate.toFixed(1)}%`
				}
				sub={winRateSub(stats)}
				definition={
					<>
						<p>
							Wins over wins plus losses. Breakeven (scratch) trades are left
							out of both.
						</p>
						<p>
							PF is profit factor: gross profit over gross loss. It shows — when
							no trade lost.
						</p>
					</>
				}
			/>
			<MetricCard
				variant={MetricVariant.Cell}
				label="Open positions"
				value={stats.activeTrades}
				sub="Current exposure"
			/>
		</section>
	);
}
