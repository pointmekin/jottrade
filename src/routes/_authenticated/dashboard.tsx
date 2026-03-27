import { createFileRoute, useRouter } from "@tanstack/react-router";
import { authClient } from "../../lib/auth-client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics } from "@/server/getAnalytics";
import { getAdvancedAnalytics } from "@/server/getAdvancedAnalytics";
import {
	EquityCurveChart,
	WinLossPie,
} from "@/components/dashboard/DashboardCharts";
import { RiskMetrics } from "@/components/dashboard/RiskMetrics";
import { PerformanceCharts } from "@/components/dashboard/PerformanceCharts";
import { Spinner } from "@/components/ui/spinner";
import { SetupCalculator } from "@/components/tools/SetupCalculator";

export const Route = createFileRoute("/_authenticated/dashboard")({
	component: Dashboard,
});

function Dashboard() {
	const session = authClient.useSession();
	const router = useRouter();
	const [sidebarOpen, setSidebarOpen] = useState(false);

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
			<div className="min-h-screen flex items-center justify-center bg-background">
				<Spinner />
			</div>
		);
	}

	if (!session.data) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-bold text-foreground">Access Denied</h1>
					<p className="text-muted-foreground">
						You need to be signed in to view this page.
					</p>
				</div>
				<button
					onClick={() => router.navigate({ to: "/sign-in" })}
					className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-colors"
				>
					Sign In
				</button>
			</div>
		);
	}

	const stats = analytics?.stats || {
		totalBalance: 0,
		activeTrades: 0,
		totalPnL: 0,
		winRate: 0,
		profitFactor: 0,
		totalTrades: 0,
	};

	const equityData = analytics?.equityCurve || [];
	const pnlColor = stats.totalPnL >= 0 ? "text-success" : "text-destructive";

	return (
		<div className="min-h-screen flex flex-col">
			<main className="flex-1 p-4 lg:p-8 overflow-y-auto">
				<div className="max-w-7xl mx-auto space-y-8">
					{/* Page header */}
					<div>
						<h1 className="text-3xl font-bold tracking-tight text-foreground mb-1">
							Dashboard
						</h1>
						<p className="text-muted-foreground text-sm">
							Your trading performance at a glance.
						</p>
					</div>

					{/* Top Stats Cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div className="bg-card border border-border rounded-lg p-5">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
								Total Balance
							</p>
							<p className="text-3xl font-bold text-foreground font-data">
								{new Intl.NumberFormat("en-US", {
									style: "currency",
									currency: "USD",
								}).format(stats.totalBalance)}
							</p>
						</div>

						<div className="bg-card border border-border rounded-lg p-5">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
								Total P&amp;L
							</p>
							<div className="flex items-end justify-between">
								<p className={`text-3xl font-bold font-data ${pnlColor}`}>
									{new Intl.NumberFormat("en-US", {
										style: "currency",
										currency: "USD",
										signDisplay: "always",
									}).format(stats.totalPnL)}
								</p>
								<span className="text-xs text-muted-foreground mb-1">
									All Time
								</span>
							</div>
						</div>

						<div className="bg-card border border-border rounded-lg p-5">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
								Active Trades
							</p>
							<div className="flex items-end justify-between">
								<p className="text-3xl font-bold text-foreground font-data">
									{stats.activeTrades}
								</p>
								<span className="text-xs text-muted-foreground mb-1">
									Open Positions
								</span>
							</div>
						</div>
					</div>

					{/* Charts Row */}
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
						{/* Equity Curve */}
						<div className="lg:col-span-2 bg-card border border-border rounded-lg p-5 min-h-[380px] flex flex-col">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
								Equity Curve
							</h3>
							<div className="flex-1">
								{equityData.length > 0 ? (
									<EquityCurveChart data={equityData} />
								) : (
									<div className="h-full flex items-center justify-center text-muted-foreground text-sm">
										No closed trades yet.
									</div>
								)}
							</div>
						</div>

						{/* Secondary Stats */}
						<div className="space-y-4">
							{/* Win Rate */}
							<div className="bg-card border border-border rounded-lg p-5">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
									Win Rate
								</h3>
								<WinLossPie winRate={stats.winRate} />
							</div>

							{/* Profit Factor */}
							<div className="bg-card border border-border rounded-lg p-5">
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
									Profit Factor
								</p>
								<p className="text-3xl font-bold text-foreground font-data">
									{stats.profitFactor.toFixed(2)}
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									{stats.profitFactor > 1.5
										? "Excellent"
										: stats.profitFactor > 1
											? "Profitable"
											: "Needs Work"}
								</p>
							</div>

							<div className="bg-card border border-border rounded-lg p-5">
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
									Total Trades
								</p>
								<p className="text-3xl font-bold text-foreground font-data">
									{stats.totalTrades}
								</p>
							</div>

							{/* Setup Calculator */}
							<div className="pt-1">
								<SetupCalculator initialBalance={stats.totalBalance || 10000} />
							</div>
						</div>
					</div>

					{/* Advanced Analytics */}
					{advanced && (
						<div className="space-y-4">
							<div className="flex items-center gap-3">
								<h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
									Risk &amp; Performance
								</h2>
								<div className="flex-1 h-px bg-border" />
							</div>
							<RiskMetrics
								sharpe={(advanced as any).riskMetrics.sharpe}
								maxDrawdown={(advanced as any).riskMetrics.maxDrawdown}
								avgRR={(advanced as any).riskMetrics.avgRR}
								avgHoldTimeHours={
									(advanced as any).riskMetrics.avgHoldTimeHours
								}
							/>
							<PerformanceCharts
								byStrategy={(advanced as any).byStrategy}
								bySymbol={(advanced as any).bySymbol}
								byDayOfWeek={(advanced as any).byDayOfWeek}
								byHour={(advanced as any).byHour}
							/>
						</div>
					)}
				</div>
			</main>

			{sidebarOpen && (
				<div
					className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
					onClick={() => setSidebarOpen(false)}
				/>
			)}
		</div>
	);
}
