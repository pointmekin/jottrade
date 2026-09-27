import { SectionHeading } from "@/components/app-page-header";
import { PerformanceCharts } from "@/components/dashboard/PerformanceCharts";
import { RiskMetrics } from "@/components/dashboard/RiskMetrics";
import { MetricCardSkeleton } from "@/components/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import type { getAdvancedAnalytics } from "@/server/getAdvancedAnalytics";

type AdvancedAnalytics = Awaited<ReturnType<typeof getAdvancedAnalytics>>;

const METRICS = ["sharpe", "drawdown", "payoff", "hold"];
const CHARTS = ["strategy", "symbol", "day", "hour"];

function RiskSectionSkeleton() {
	return (
		<>
			<div className="metric-row grid-cols-2 md:grid-cols-4">
				{METRICS.map((key) => (
					<MetricCardSkeleton key={key} />
				))}
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-hidden="true">
				{CHARTS.map((key) => (
					<div key={key} className="surface p-3 sm:p-4">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="mt-4 h-48 w-full" />
					</div>
				))}
			</div>
		</>
	);
}

export function RiskSection({
	data,
	isLoading,
	periodLabel,
}: {
	data: AdvancedAnalytics | undefined;
	isLoading: boolean;
	periodLabel: string;
}) {
	const currency = useCurrency();
	if (!isLoading && !data) return null;

	return (
		<section className="mt-6 space-y-4 sm:mt-8">
			<SectionHeading
				title="Risk and performance"
				detail={
					data
						? `${data.riskMetrics.closedTrades} closed trades · ${periodLabel} · ${currency}`
						: periodLabel
				}
			/>
			{data ? (
				<>
					<RiskMetrics metrics={data.riskMetrics} />
					<PerformanceCharts
						byStrategy={data.byStrategy}
						bySymbol={data.bySymbol}
						byDayOfWeek={data.byDayOfWeek}
						byHour={data.byHour}
					/>
				</>
			) : (
				<RiskSectionSkeleton />
			)}
		</section>
	);
}
