import { createFileRoute, useRouter } from "@tanstack/react-router";
import { authClient } from "../../lib/auth-client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics } from "@/server/getAnalytics";
import {
  EquityCurveChart,
  WinLossPie,
} from "@/components/dashboard/DashboardCharts";
import { Spinner } from "@/components/ui/spinner";

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
  if (session.isPending || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Spinner />
      </div>
    );
  }

  if (!session.data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Access Denied</h1>
          <p className="text-foreground">
            You need to be signed in to view this page.
          </p>
        </div>
        <button
          onClick={() => router.navigate({ to: "/sign-in" })}
          className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-foreground font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/25"
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

  return (
    <div className="min-h-screen bg-background text-slate-100 flex">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Dashboard Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner />
            </div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Overview
                </h2>
                <p className="text-foreground">
                  Welcome back to your trading dashboard.
                </p>
              </div>

              {/* Top Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Balance */}
                <div className="bg-background/50 border border-slate-700/50 rounded-xl p-6">
                  <p className="text-foreground text-sm font-medium mb-2">
                    Total Balance
                  </p>
                  <div className="flex items-end justify-between">
                    <h3 className="text-3xl font-bold text-foreground">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(stats.totalBalance)}
                    </h3>
                  </div>
                </div>

                {/* Profit/Loss */}
                <div className="bg-background/50 border border-slate-700/50 rounded-xl p-6">
                  <p className="text-foreground text-sm font-medium mb-2">
                    Total P&L
                  </p>
                  <div className="flex items-end justify-between">
                    <h3
                      className={`text-3xl font-bold ${stats.totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        signDisplay: "always",
                      }).format(stats.totalPnL)}
                    </h3>
                    <span className="text-sm text-foreground">All Time</span>
                  </div>
                </div>

                {/* Active Trades */}
                <div className="bg-background/50 border border-slate-700/50 rounded-xl p-6">
                  <p className="text-foreground text-sm font-medium mb-2">
                    Active Trades
                  </p>
                  <div className="flex items-end justify-between">
                    <h3 className="text-3xl font-bold text-foreground">
                      {stats.activeTrades}
                    </h3>
                    <span className="text-sm text-foreground">
                      Open Positions
                    </span>
                  </div>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Equity Curve - Takes up 2/3 */}
                <div className="lg:col-span-2 bg-background/50 border border-slate-700/50 rounded-xl p-6 min-h-[400px] flex flex-col">
                  <h3 className="text-lg font-semibold text-foreground mb-4">
                    Equity Curve
                  </h3>
                  <div className="flex-1">
                    {equityData.length > 0 ? (
                      <EquityCurveChart data={equityData} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-foreground">
                        No closed trades yet.
                      </div>
                    )}
                  </div>
                </div>

                {/* Secondary Stats/charts */}
                <div className="space-y-6">
                  {/* Win Rate */}
                  <div className="bg-background/50 border border-slate-700/50 rounded-xl p-6 flex flex-col">
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      Win Rate
                    </h3>
                    <div className="flex-1">
                      <WinLossPie winRate={stats.winRate} />
                    </div>
                  </div>

                  {/* Profit Factor */}
                  <div className="bg-background/50 border border-slate-700/50 rounded-xl p-6">
                    <p className="text-foreground text-sm font-medium mb-2">
                      Profit Factor
                    </p>
                    <h3 className="text-3xl font-bold text-foreground">
                      {stats.profitFactor.toFixed(2)}
                    </h3>
                    <p className="text-xs text-foreground mt-1">
                      {stats.profitFactor > 1.5
                        ? "Excellent 🚀"
                        : stats.profitFactor > 1
                          ? "Profitable 👍"
                          : "Needs Work 📉"}
                    </p>
                  </div>

                  <div className="bg-background/50 border border-slate-700/50 rounded-xl p-6">
                    <p className="text-foreground text-sm font-medium mb-2">
                      Total Trades
                    </p>
                    <h3 className="text-3xl font-bold text-foreground">
                      {stats.totalTrades}
                    </h3>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
