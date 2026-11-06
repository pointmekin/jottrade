import { lazy, Suspense } from "react";
import { SectionHeading } from "@/components/app-page-header";
import { RiskMetrics } from "@/components/dashboard/RiskMetrics";
import { SessionFindings } from "@/components/dashboard/session-findings";
import { SizingFinding } from "@/components/dashboard/sizing-finding";
import { TagFindings } from "@/components/dashboard/tag-findings";
import { MetricCardSkeleton } from "@/components/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricVariant } from "@/lib/metric";
import type { getAdvancedAnalytics } from "@/server/getAdvancedAnalytics";

type AdvancedAnalytics = Awaited<ReturnType<typeof getAdvancedAnalytics>>;

const PerformanceCharts = lazy(() =>
	import("@/components/dashboard/PerformanceCharts").then((module) => ({
		default: module.PerformanceCharts,
	})),
);

const METRICS = ["sharpe", "drawdown", "payoff", "hold"];

const Finding = {
	Tags: "tags",
	Sizing: "sizing",
	Sessions: "sessions",
} as const;

function ChartSkeleton() {
	return (
		<div className="space-y-5" aria-hidden="true">
			<Skeleton className="h-9 w-80 max-w-full" />
			<Skeleton className="h-[264px] w-full" />
		</div>
	);
}

function RiskSectionSkeleton() {
	return (
		<>
			<div className="metric-row grid-cols-2 md:grid-cols-4">
				{METRICS.map((key) => (
					<MetricCardSkeleton key={key} variant={MetricVariant.Cell} />
				))}
			</div>
			<ChartSkeleton />
		</>
	);
}

function FindingsSection({ data }: { data: AdvancedAnalytics }) {
	const { findings } = data;
	const hasTags = findings.tags.length > 0;
	return (
		<section className="page-section space-y-4" aria-label="Findings">
			<SectionHeading
				title="Findings"
				detail="How tags, sizing and sessions relate to your results"
			/>
			<Tabs
				defaultValue={hasTags ? Finding.Tags : Finding.Sizing}
				className="gap-4"
			>
				<TabsList aria-label="Finding">
					{hasTags && (
						<TabsTrigger value={Finding.Tags} className="px-3 max-sm:h-9">
							Tags
						</TabsTrigger>
					)}
					<TabsTrigger value={Finding.Sizing} className="px-3 max-sm:h-9">
						Sizing after a loss
					</TabsTrigger>
					<TabsTrigger value={Finding.Sessions} className="px-3 max-sm:h-9">
						Sessions
					</TabsTrigger>
				</TabsList>
				<TabsContent value={Finding.Tags}>
					<TagFindings scope={findings.scope} tags={findings.tags} />
				</TabsContent>
				<TabsContent value={Finding.Sizing}>
					<SizingFinding sizing={findings.sizing} />
				</TabsContent>
				<TabsContent value={Finding.Sessions}>
					<SessionFindings
						scope={findings.scope}
						sessions={findings.sessions}
					/>
				</TabsContent>
			</Tabs>
		</section>
	);
}

export function RiskSection({
	data,
	isLoading,
	isAccountWide,
}: {
	data: AdvancedAnalytics | undefined;
	isLoading: boolean;
	isAccountWide?: boolean;
}) {
	if (!isLoading && !data) return null;

	return (
		<>
			<section className="page-section space-y-6" aria-label="Performance">
				<SectionHeading
					title="Performance"
					detail={
						data ? `${data.riskMetrics.closedTrades} closed trades` : undefined
					}
				/>
				{data ? (
					<>
						<RiskMetrics
							metrics={data.riskMetrics}
							isAccountWide={isAccountWide}
						/>
						<Suspense fallback={<ChartSkeleton />}>
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
					</>
				) : (
					<RiskSectionSkeleton />
				)}
			</section>
			{data && <FindingsSection data={data} />}
		</>
	);
}
