import {
	createFileRoute,
	Link,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { AppPageHeader, SectionHeading } from "@/components/app-page-header";
import {
	AccountSummary,
	AccountSummarySkeleton,
} from "@/components/dashboard/account-summary";
import { EquityCurveSection } from "@/components/dashboard/equity-curve-section";
import { FundingNotice } from "@/components/dashboard/funding-notice";
import { RiskSection } from "@/components/dashboard/risk-section";
import { PeriodPicker } from "@/components/period-picker";
import { SetupCalculator } from "@/components/tools/SetupCalculator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { useDashboardAnalytics } from "@/hooks/use-dashboard-analytics";
import { formatMoneyWithCode } from "@/lib/currency";
import { JournalIntent } from "@/lib/journal-search";
import {
	describePeriod,
	PeriodPreset,
	type PeriodSelection,
} from "@/lib/period";

const dashboardSearchSchema = z.object({
	period: z.enum(PeriodPreset).default(PeriodPreset.All),
	from: z.string().optional(),
	to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
	validateSearch: dashboardSearchSchema,
	component: Dashboard,
});

function Dashboard() {
	const navigate = useNavigate({ from: "/dashboard" });
	const search = useSearch({ from: "/_authenticated/dashboard" });
	const currency = useCurrency();
	const selection: PeriodSelection = useMemo(
		() => ({ preset: search.period, from: search.from, to: search.to }),
		[search.period, search.from, search.to],
	);
	const { summary, advanced } = useDashboardAnalytics(selection);

	const stats = summary.data?.stats;
	const periodLabel = describePeriod(selection);
	const hasFunding = stats
		? stats.openingBalance !== 0 || stats.netDeposits !== 0
		: true;

	return (
		<div className="app-page">
			<main className="page-frame section-enter">
				<AppPageHeader
					title="Dashboard"
					meta={`${periodLabel} · ${currency}`}
					actions={
						<>
							<PeriodPicker
								value={selection}
								onChange={(next) =>
									navigate({
										search: {
											period: next.preset ?? PeriodPreset.All,
											from: next.from,
											to: next.to,
										},
									})
								}
							/>
							<Button asChild>
								<Link to="/journal" search={{ intent: JournalIntent.Log }}>
									<Plus className="size-4" /> Log trade
								</Link>
							</Button>
						</>
					}
				/>
				{!hasFunding && <FundingNotice />}
				{stats ? (
					<AccountSummary
						stats={stats}
						isAllTime={search.period === PeriodPreset.All}
					/>
				) : (
					<AccountSummarySkeleton />
				)}
				<EquityCurveSection
					data={summary.data?.equityCurve ?? []}
					isLoading={summary.isLoading}
					totalTrades={stats?.totalTrades ?? 0}
					periodLabel={periodLabel}
				/>
				<RiskSection
					data={advanced.data}
					isLoading={advanced.isLoading}
					periodLabel={periodLabel}
				/>
				<section className="mt-6 space-y-4 sm:mt-8">
					<SectionHeading
						title="Tools"
						detail={`Plan a setup before you take it · ${formatMoneyWithCode(stats?.totalBalance ?? 0, currency)}`}
					/>
					{stats ? (
						<SetupCalculator initialBalance={stats.totalBalance} />
					) : (
						<Skeleton className="h-72 w-full" />
					)}
				</section>
			</main>
		</div>
	);
}
