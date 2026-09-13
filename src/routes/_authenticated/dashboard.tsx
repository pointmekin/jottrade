import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { ArrowRight, Crosshair, Plus, Wallet } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { AppPageHeader, SectionHeading } from "@/components/app-page-header";
import { EquityCurveChart } from "@/components/dashboard/DashboardCharts";
import { PerformanceCharts } from "@/components/dashboard/PerformanceCharts";
import { RiskMetrics } from "@/components/dashboard/RiskMetrics";
import { PeriodPicker } from "@/components/period-picker";
import { SetupCalculator } from "@/components/tools/SetupCalculator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import type { TradeStats } from "@/lib/analytics";
import { formatMoney, formatMoneyWithCode } from "@/lib/currency";
import {
	describePeriod,
	PeriodPreset,
	type PeriodSelection,
	resolvePeriod,
} from "@/lib/period";
import { getAdvancedAnalytics } from "@/server/getAdvancedAnalytics";
import { getAnalytics } from "@/server/getAnalytics";
import { authClient } from "../../lib/auth-client";

const dashboardSearchSchema = z.object({
	period: z.nativeEnum(PeriodPreset).default(PeriodPreset.All),
	from: z.string().optional(),
	to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
	validateSearch: dashboardSearchSchema,
	component: Dashboard,
});

const EMPTY_STATS: TradeStats = {
	openingBalance: 0,
	netDeposits: 0,
	totalBalance: 0,
	activeTrades: 0,
	totalPnL: 0,
	winRate: 0,
	profitFactor: null,
	totalTrades: 0,
	winningTrades: 0,
	losingTrades: 0,
	breakevenTrades: 0,
};

function Dashboard() {
	const session = authClient.useSession();
	const router = useRouter();
	const navigate = useNavigate({ from: "/dashboard" });
	const search = useSearch({ from: "/_authenticated/dashboard" });
	const currency = useCurrency();

	const selection: PeriodSelection = useMemo(
		() => ({ preset: search.period, from: search.from, to: search.to }),
		[search.period, search.from, search.to],
	);

	// The preset resolves against the browser clock, so "this month" follows the
	// user's timezone rather than the server's.
	const rangeInput = useMemo(() => {
		const { from, to } = resolvePeriod(selection);
		return {
			from: from?.toISOString(),
			to: to?.toISOString(),
		};
	}, [selection]);

	const { data: analytics, isLoading } = useQuery({
		queryKey: ["analytics", rangeInput],
		queryFn: () => getAnalytics({ data: rangeInput } as never),
	});
	const { data: advanced, isLoading: isAdvancedLoading } = useQuery({
		queryKey: ["advanced-analytics", rangeInput],
		queryFn: () => getAdvancedAnalytics({ data: rangeInput } as never),
		staleTime: 5 * 60 * 1000,
	});

	if (session.isPending) {
		return <DashboardLoadingSkeleton />;
	}

	if (!session.data) {
		return (
			<div className="app-page flex items-center justify-center">
				<div className="empty-field max-w-lg">
					<Crosshair className="mb-4 size-6 text-ring" />
					<h1 className="text-2xl font-semibold">Sign in required</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Sign in to view your trading data.
					</p>
					<Button
						className="mt-5"
						onClick={() => router.navigate({ to: "/sign-in" })}
					>
						Sign in
					</Button>
				</div>
			</div>
		);
	}

	const stats = analytics?.stats ?? EMPTY_STATS;
	const equityData = analytics?.equityCurve || [];
	const pnlTone = stats.totalPnL >= 0 ? "text-success" : "text-destructive";
	const periodLabel = describePeriod(selection);
	const isAllTime = (selection.preset ?? PeriodPreset.All) === PeriodPreset.All;
	const hasFunding = stats.openingBalance !== 0 || stats.netDeposits !== 0;

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
								<Link to="/journal" search={{ intent: "log" } as never}>
									<Plus className="size-4" /> Log trade
								</Link>
							</Button>
						</>
					}
				/>

				{!isLoading && !hasFunding && (
					<div className="surface mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
						<div className="flex items-start gap-3">
							<Wallet className="mt-0.5 size-4 text-muted-foreground" />
							<div>
								<p className="text-sm font-medium text-foreground">
									No deposits recorded
								</p>
								<p className="mt-0.5 text-sm text-muted-foreground">
									Balance starts at zero until you record what you funded the
									account with.
								</p>
							</div>
						</div>
						<Button asChild variant="outline" size="sm">
							<Link to="/settings">Add deposits</Link>
						</Button>
					</div>
				)}

				{isLoading ? (
					<MetricSkeletonRow />
				) : (
					<section
						className="metric-row mt-4 grid-cols-2 lg:grid-cols-4"
						aria-label="Account summary"
					>
						<div className="metric-cell">
							<p className="field-label">Account balance</p>
							<p className="metric-value mt-1">
								{formatMoney(stats.totalBalance, currency)}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{isAllTime
									? `Deposits ${formatMoney(stats.netDeposits, currency, { signed: true })}`
									: `Opened at ${formatMoney(stats.openingBalance, currency)}`}
							</p>
						</div>
						<div className="metric-cell">
							<p className="field-label">Net P&amp;L</p>
							<p className={`metric-value mt-1 ${pnlTone}`}>
								{formatMoney(stats.totalPnL, currency, { signed: true })}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Across {stats.totalTrades} trades
							</p>
						</div>
						<div className="metric-cell">
							<p className="field-label">Win rate</p>
							<p className="metric-value mt-1">{stats.winRate.toFixed(1)}%</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{stats.winningTrades}W / {stats.losingTrades}L
								{stats.breakevenTrades > 0 &&
									` / ${stats.breakevenTrades} scratch`}
								{" · PF "}
								{stats.profitFactor === null
									? "—"
									: stats.profitFactor.toFixed(2)}
							</p>
						</div>
						<div className="metric-cell">
							<p className="field-label">Open positions</p>
							<p className="metric-value mt-1">{stats.activeTrades}</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Current exposure
							</p>
						</div>
					</section>
				)}

				<section className="surface mt-6 p-3 sm:p-4 md:p-5">
					<SectionHeading
						title="Equity curve"
						detail={`${stats.totalTrades} trades · ${periodLabel} · ${currency}`}
						actions={
							<Button asChild variant="outline" size="sm">
								<Link to="/journal">
									Open journal <ArrowRight className="size-4" />
								</Link>
							</Button>
						}
					/>
					<div className="mt-3 h-[18rem] sm:mt-4 sm:h-[20rem] md:h-[22rem]">
						{isLoading ? (
							<Skeleton className="h-full w-full" />
						) : equityData.length > 0 ? (
							<EquityCurveChart data={equityData} currency={currency} />
						) : (
							<div className="empty-field h-full border-0">
								<Crosshair className="mb-4 size-6 text-muted-foreground" />
								<p className="font-semibold">Nothing in this period</p>
								<p className="mt-1 max-w-sm text-sm text-muted-foreground">
									No closed trade or deposit falls inside {periodLabel}. Widen
									the period or record a trade.
								</p>
								<Button asChild variant="outline" className="mt-5">
									<Link to="/journal" search={{ intent: "log" } as never}>
										Record first trade
									</Link>
								</Button>
							</div>
						)}
					</div>
				</section>

				{(isAdvancedLoading || advanced) && (
					<section className="mt-6 space-y-4 sm:mt-8">
						<SectionHeading title="Risk and performance" detail={periodLabel} />
						{isAdvancedLoading ? (
							<>
								<MetricSkeletonRow cards />
								<PerformanceSkeleton />
							</>
						) : (
							<>
								<RiskMetrics
									sharpe={(advanced as any).riskMetrics.sharpe}
									maxDrawdown={(advanced as any).riskMetrics.maxDrawdown}
									avgRR={(advanced as any).riskMetrics.avgRR}
									avgHoldTimeHours={
										(advanced as any).riskMetrics.avgHoldTimeHours
									}
									currency={currency}
								/>
								<PerformanceCharts
									byStrategy={(advanced as any).byStrategy}
									bySymbol={(advanced as any).bySymbol}
									byDayOfWeek={(advanced as any).byDayOfWeek}
									byHour={(advanced as any).byHour}
								/>
							</>
						)}
					</section>
				)}

				<section className="mt-6 space-y-4 sm:mt-8">
					<SectionHeading
						title="Tools"
						detail={`Plan a setup before you take it · ${formatMoneyWithCode(stats.totalBalance, currency)}`}
					/>
					{isLoading ? (
						<Skeleton className="h-72 w-full" />
					) : (
						<SetupCalculator initialBalance={stats.totalBalance} />
					)}
				</section>
			</main>
		</div>
	);
}

function MetricSkeletonRow({ cards = false }: { cards?: boolean }) {
	return (
		<div
			className={
				cards
					? "metric-row grid-cols-2 md:grid-cols-4"
					: "metric-row mt-4 grid-cols-2 lg:grid-cols-4"
			}
			aria-hidden="true"
		>
			{["balance", "pnl", "win-rate", "positions"].map((key) => (
				<div key={key} className={cards ? "surface p-4" : "metric-cell"}>
					<Skeleton className="h-4 w-24" />
					<Skeleton className="mt-2 h-7 w-28" />
					<Skeleton className="mt-2 h-3 w-20" />
				</div>
			))}
		</div>
	);
}

function PerformanceSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-hidden="true">
			{["strategy", "symbol", "day", "hour"].map((key) => (
				<div key={key} className="surface p-3 sm:p-4">
					<Skeleton className="h-4 w-40" />
					<Skeleton className="mt-4 h-48 w-full" />
				</div>
			))}
		</div>
	);
}

function DashboardLoadingSkeleton() {
	return (
		<div className="app-page">
			<main className="page-frame">
				<AppPageHeader
					title="Dashboard"
					meta="Loading account"
					actions={
						<>
							<Skeleton className="h-8 w-44" />
							<Skeleton className="h-9 w-28" />
						</>
					}
				/>
				<MetricSkeletonRow />
				<section className="surface mt-6 p-3 sm:p-4 md:p-5">
					<div className="flex items-center justify-between gap-3">
						<Skeleton className="h-5 w-28" />
						<Skeleton className="h-8 w-28" />
					</div>
					<Skeleton className="mt-3 h-[18rem] w-full sm:mt-4 sm:h-[20rem] md:h-[22rem]" />
				</section>
				<section className="mt-6 space-y-4 sm:mt-8">
					<Skeleton className="h-5 w-44" />
					<MetricSkeletonRow cards />
					<PerformanceSkeleton />
				</section>
				<section className="mt-6 space-y-4 sm:mt-8">
					<Skeleton className="h-5 w-20" />
					<Skeleton className="h-72 w-full" />
				</section>
			</main>
		</div>
	);
}
