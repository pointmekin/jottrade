import { useQuery } from "@tanstack/react-query";
import { SectionHeading } from "@/components/app-page-header";
import { MetricCard, MetricCardSkeleton } from "@/components/metric-card";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { MetricVariant, toneOf, UNAVAILABLE } from "@/lib/metric";
import { QueryKey } from "@/lib/query-keys";
import { getStrategyPerformance } from "@/server/strategyActions";

const CELL_KEYS = ["trades", "win-rate", "avg", "total"];

export function StrategyPerformance({ strategyId }: { strategyId: number }) {
	const { activeAccount } = useAccounts();
	const currency = useCurrency();
	const portfolioId = activeAccount?.id;

	const { data } = useQuery({
		queryKey: [QueryKey.StrategyPerformance, portfolioId, strategyId],
		queryFn: () =>
			getStrategyPerformance({
				data: { portfolioId: portfolioId as number, strategyId },
			}),
		enabled: portfolioId !== undefined,
	});

	const scope = ["All time", activeAccount?.name, currency]
		.filter(Boolean)
		.join(" · ");
	const money = (value: number) =>
		formatMoney(value, currency, { signed: true });

	return (
		<section className="mt-6 space-y-3" aria-label="Strategy performance">
			<SectionHeading title="Performance" detail={scope} />
			{!data && (
				<div className="grid grid-cols-2 gap-3">
					{CELL_KEYS.map((key) => (
						<MetricCardSkeleton key={key} variant={MetricVariant.Compact} />
					))}
				</div>
			)}
			{data?.count === 0 && (
				<p className="empty-field min-h-0 py-6 text-sm text-muted-foreground">
					No closed trades use this strategy in this account yet.
				</p>
			)}
			{data && data.count > 0 && (
				<div className="grid grid-cols-2 gap-3">
					<MetricCard
						variant={MetricVariant.Compact}
						label="Closed trades"
						value={data.count}
						sub={`${data.wins}W / ${data.losses}L / ${data.breakeven} scratch`}
					/>
					<MetricCard
						variant={MetricVariant.Compact}
						label="Win rate"
						value={
							data.winRate === null
								? UNAVAILABLE
								: `${data.winRate.toFixed(1)}%`
						}
						sub={data.winRate === null ? "No win or loss yet" : "Scratch excluded"}
						definition={
							<p>
								Wins over wins plus losses. Breakeven (scratch) trades are left
								out of both, as on the dashboard.
							</p>
						}
					/>
					<MetricCard
						variant={MetricVariant.Compact}
						label="Avg P&L"
						value={money(data.avgPnl)}
						sub="Per closed trade"
					/>
					<MetricCard
						variant={MetricVariant.Compact}
						label="Total P&L"
						value={money(data.totalPnl)}
						tone={toneOf(data.totalPnl)}
						sub="Sum of closed trades"
					/>
				</div>
			)}
		</section>
	);
}
