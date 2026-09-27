import { useQuery } from "@tanstack/react-query";
import { SectionHeading } from "@/components/app-page-header";
import { MetricLabel } from "@/components/metric-label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { getStrategyPerformance } from "@/server/strategyActions";

const CELL_KEYS = ["trades", "win-rate", "avg", "total"];

export function StrategyPerformance({ strategyId }: { strategyId: number }) {
	const { activeAccount } = useAccounts();
	const currency = useCurrency();
	const portfolioId = activeAccount?.id;

	const { data } = useQuery({
		queryKey: ["strategy-performance", portfolioId, strategyId],
		queryFn: () =>
			getStrategyPerformance({
				data: { portfolioId: portfolioId as number, strategyId },
			}),
		enabled: portfolioId !== undefined,
	});

	const scope = ["All time", activeAccount?.name, currency]
		.filter(Boolean)
		.join(" · ");

	return (
		<section className="mt-6 space-y-3" aria-label="Strategy performance">
			<SectionHeading title="Performance" detail={scope} />
			{!data && (
				<div className="grid grid-cols-2 gap-3" aria-hidden="true">
					{CELL_KEYS.map((key) => (
						<div key={key} className="surface p-3">
							<Skeleton className="h-4 w-16" />
							<Skeleton className="mt-2 h-5 w-20" />
							<Skeleton className="mt-2 h-3 w-24" />
						</div>
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
					<div className="surface p-3">
						<p className="field-label">Closed trades</p>
						<p className="mt-1 font-data text-sm font-semibold">{data.count}</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{`${data.wins}W / ${data.losses}L / ${data.breakeven} scratch`}
						</p>
					</div>
					<div className="surface p-3">
						<MetricLabel label="Win rate">
							<p>
								Wins over wins plus losses. Breakeven (scratch) trades are left
								out of both, as on the dashboard.
							</p>
						</MetricLabel>
						<p className="mt-1 font-data text-sm font-semibold">
							{data.winRate === null ? "—" : `${data.winRate.toFixed(1)}%`}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{data.winRate === null
								? "No win or loss yet"
								: "Scratch excluded"}
						</p>
					</div>
					<div className="surface p-3">
						<p className="field-label">{"Avg P&L"}</p>
						<p className="mt-1 font-data text-sm font-semibold">
							{formatMoney(data.avgPnl, currency, { signed: true })}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Per closed trade
						</p>
					</div>
					<div className="surface p-3">
						<p className="field-label">{"Total P&L"}</p>
						<p
							className={`mt-1 font-data text-sm font-semibold ${data.totalPnl >= 0 ? "text-success" : "text-destructive"}`}
						>
							{formatMoney(data.totalPnl, currency, { signed: true })}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Sum of closed trades
						</p>
					</div>
				</div>
			)}
		</section>
	);
}
