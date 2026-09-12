import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, Crosshair, Plus } from "lucide-react";
import { AppPageHeader, SectionHeading } from "@/components/app-page-header";
import { EquityCurveChart } from "@/components/dashboard/DashboardCharts";
import { PerformanceCharts } from "@/components/dashboard/PerformanceCharts";
import { RiskMetrics } from "@/components/dashboard/RiskMetrics";
import { SetupCalculator } from "@/components/tools/SetupCalculator";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { TradeStats } from "@/lib/analytics";
import { getAdvancedAnalytics } from "@/server/getAdvancedAnalytics";
import { getAnalytics } from "@/server/getAnalytics";
import { authClient } from "../../lib/auth-client";

export const Route = createFileRoute("/_authenticated/dashboard")({
	component: Dashboard,
});

const currency = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});
const signedCurrency = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	signDisplay: "always",
});

const EMPTY_STATS: TradeStats = {
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
	const { data: analytics, isLoading } = useQuery({
		queryKey: ["analytics"],
		queryFn: () => getAnalytics({ data: undefined }),
	});
	const { data: advanced } = useQuery({
		queryKey: ["advanced-analytics"],
		queryFn: () => getAdvancedAnalytics({ data: undefined }),
		staleTime: 5 * 60 * 1000,
	});

	if (session.isPending || isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Spinner />
			</div>
		);
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

	return (
		<div className="app-page">
			<main className="page-frame section-enter">
				<AppPageHeader
					title="Dashboard"
					actions={
						<Button asChild>
							<Link to="/journal" search={{ intent: "log" } as never}>
								<Plus className="size-4" /> Log trade
							</Link>
						</Button>
					}
				/>

				<section
					className="metric-row grid-cols-2 lg:grid-cols-4"
					aria-label="Account summary"
				>
					<div className="metric-cell">
						<p className="field-label">Account balance</p>
						<p className="metric-value mt-1">
							{currency.format(stats.totalBalance)}
						</p>
					</div>
					<div className="metric-cell">
						<p className="field-label">Net P&amp;L</p>
						<p className={`metric-value mt-1 ${pnlTone}`}>
							{signedCurrency.format(stats.totalPnL)}
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

				<section className="surface mt-6 p-4 md:p-5">
					<SectionHeading
						title="Equity curve"
						detail={`${stats.totalTrades} recorded trades`}
						actions={
							<Button asChild variant="outline" size="sm">
								<Link to="/journal">
									Open journal <ArrowRight className="size-4" />
								</Link>
							</Button>
						}
					/>
					<div className="mt-4 h-[22rem]">
						{equityData.length > 0 ? (
							<EquityCurveChart data={equityData} />
						) : (
							<div className="empty-field h-full border-0">
								<Crosshair className="mb-4 size-6 text-muted-foreground" />
								<p className="font-semibold">No closed trades yet</p>
								<p className="mt-1 max-w-sm text-sm text-muted-foreground">
									Record a completed trade and its result becomes the first
									point on this curve.
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

				{advanced && (
					<section className="mt-8 space-y-4">
						<SectionHeading
							title="Risk and performance"
							detail="All recorded history"
						/>
						<RiskMetrics
							sharpe={(advanced as any).riskMetrics.sharpe}
							maxDrawdown={(advanced as any).riskMetrics.maxDrawdown}
							avgRR={(advanced as any).riskMetrics.avgRR}
							avgHoldTimeHours={(advanced as any).riskMetrics.avgHoldTimeHours}
						/>
						<PerformanceCharts
							byStrategy={(advanced as any).byStrategy}
							bySymbol={(advanced as any).bySymbol}
							byDayOfWeek={(advanced as any).byDayOfWeek}
							byHour={(advanced as any).byHour}
						/>
					</section>
				)}

				<section className="mt-8 space-y-4">
					<SectionHeading
						title="Tools"
						detail="Plan a setup before you take it"
					/>
					<SetupCalculator initialBalance={stats.totalBalance || 10000} />
				</section>
			</main>
		</div>
	);
}
