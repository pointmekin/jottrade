import { lazy, Suspense } from "react";
import { SectionHeading } from "@/components/app-page-header";
import { RiskMetrics } from "@/components/dashboard/RiskMetrics";
import { SessionFindings } from "@/components/dashboard/session-findings";
import { SizingFinding } from "@/components/dashboard/sizing-finding";
import { TagFindings } from "@/components/dashboard/tag-findings";
import { MetricCardSkeleton } from "@/components/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import type { getAdvancedAnalytics } from "@/server/getAdvancedAnalytics";

type AdvancedAnalytics = Awaited<ReturnType<typeof getAdvancedAnalytics>>;

const PerformanceCharts = lazy(() =>
	import("@/components/dashboard/PerformanceCharts").then((module) => ({
		default: module.PerformanceCharts,
	})),
);

const METRICS = ["sharpe", "drawdown", "payoff", "hold"];
const CHARTS = ["strategy", "symbol", "day", "hour"];

function ChartsSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-hidden="true">
			{CHARTS.map((key) => (
				<div key={key} className="surface p-3 sm:p-4">
					<Skeleton className="h-4 w-40" />
					<Skeleton className="mt-4 h-48 w-full" />
				</div>
			))}
		</div>
	);
}

function RiskSectionSkeleton() {
	return (
		<>
			<div className="metric-row grid-cols-2 md:grid-cols-4">
				{METRICS.map((key) => (
					<MetricCardSkeleton key={key} />
				))}
			</div>
			<ChartsSkeleton />
		</>
	);
}

export function RiskSection({
	data,
	isLoading,
	periodLabel,
	isAccountWide,
}: {
	data: AdvancedAnalytics | undefined;
	isLoading: boolean;
	periodLabel: string;
	isAccountWide?: boolean;
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
					<RiskMetrics
						metrics={data.riskMetrics}
						isAccountWide={isAccountWide}
					/>
					<Suspense fallback={<ChartsSkeleton />}>
						<PerformanceCharts
							closedTrades={data.riskMetrics.closedTrades}
							insightCoverage={data.insightCoverage}
							byStrategy={data.byStrategy}
							bySymbol={data.bySymbol}
							byTag={data.byTag}
							byAdherence={data.byAdherence}
							byRuleCheck={data.byRuleCheck}
							byDayOfWeek={data.byDayOfWeek}
							byHour={data.byHour}
						/>
					</Suspense>
					<TagFindings scope={data.findings.scope} tags={data.findings.tags} />
					<SizingFinding sizing={data.findings.sizing} />
					<SessionFindings
						scope={data.findings.scope}
						sessions={data.findings.sessions}
					/>
				</>
			) : (
				<RiskSectionSkeleton />
			)}
		</section>
	);
}
