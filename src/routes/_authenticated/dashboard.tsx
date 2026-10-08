import {
	createFileRoute,
	Link,
	retainSearchParams,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AppPageHeader, SectionHeading } from "@/components/app-page-header";
import {
	AccountSummary,
	AccountSummarySkeleton,
} from "@/components/dashboard/account-summary";
import { EquityCurveSection } from "@/components/dashboard/equity-curve-section";
import { FundingNotice } from "@/components/dashboard/funding-notice";
import { RiskSection } from "@/components/dashboard/risk-section";
import { ScopeNotice } from "@/components/dashboard/scope-notice";
import { FilterBar } from "@/components/journal/FilterBar";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { SetupCalculator } from "@/components/tools/SetupCalculator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { useDashboardAnalytics } from "@/hooks/use-dashboard-analytics";
import { useOnboarding } from "@/hooks/use-onboarding";
import { formatMoneyWithCode } from "@/lib/currency";
import {
	CLEARED_TRADE_FILTERS,
	dashboardSearchSchema,
	JournalIntent,
	SCOPE_SEARCH_KEYS,
} from "@/lib/journal-search";
import { describePeriod, PeriodPreset } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/dashboard")({
	validateSearch: dashboardSearchSchema,
	search: { middlewares: [retainSearchParams(SCOPE_SEARCH_KEYS)] },
	component: Dashboard,
});

function Dashboard() {
	const navigate = useNavigate({ from: "/dashboard" });
	const search = useSearch({ from: "/_authenticated/dashboard" });
	const currency = useCurrency();
	const { summary, advanced } = useDashboardAnalytics(search);
	const { isChecklistVisible } = useOnboarding();

	const stats = summary.data?.stats;
	const scope = summary.data?.scope;
	const isScoped = scope?.isFiltered || search.period !== PeriodPreset.All;
	const periodLabel = describePeriod({
		preset: search.period,
		from: search.dateFrom,
		to: search.dateTo,
	});
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
						<Button asChild>
							<Link to="/journal" search={{ intent: JournalIntent.Log }}>
								<Plus className="size-4" /> Log trade
							</Link>
						</Button>
					}
				/>
				<FilterBar
					filters={search}
					onFiltersChange={(filters) =>
						navigate({ search: { ...search, ...filters } })
					}
				/>
				{scope && (
					<ScopeNotice
						scope={scope}
						isEmpty={Boolean(isScoped && stats?.totalTrades === 0)}
						onClear={() =>
							navigate({
								search: {
									...CLEARED_TRADE_FILTERS,
									period: PeriodPreset.All,
									dateFrom: undefined,
									dateTo: undefined,
								},
							})
						}
					/>
				)}
				<OnboardingChecklist />
				{!hasFunding && !isChecklistVisible && <FundingNotice />}
				{stats ? (
					<AccountSummary
						stats={stats}
						isAllTime={search.period === PeriodPreset.All}
						isAccountWide={scope?.isFiltered}
					/>
				) : (
					<AccountSummarySkeleton />
				)}
				<EquityCurveSection
					data={summary.data?.equityCurve ?? []}
					isLoading={summary.isLoading}
					totalTrades={stats?.totalTrades ?? 0}
					periodLabel={periodLabel}
					isAccountWide={scope?.isFiltered}
				/>
				<RiskSection
					data={advanced.data}
					isLoading={advanced.isLoading}
					periodLabel={periodLabel}
					isAccountWide={scope?.isFiltered}
				/>
				<section className="mt-6 space-y-4 sm:mt-8">
					<SectionHeading
						title="Tools"
						detail={`Plan a setup before you take it · ${formatMoneyWithCode(stats?.totalBalance ?? 0, currency)}`}
					/>
					{stats ? <SetupCalculator /> : <Skeleton className="h-72 w-full" />}
				</section>
			</main>
		</div>
	);
}
