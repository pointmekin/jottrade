import { MetricCard, MetricCardSkeleton } from "@/components/metric-card";
import { MetricLabel } from "@/components/metric-label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import type { TradeStats } from "@/lib/analytics";
import { formatMoney } from "@/lib/currency";
import { MetricVariant, toneOf, UNAVAILABLE } from "@/lib/metric";

const STRIP_CELLS = ["pnl", "win-rate", "positions"];
const LAYOUT_CLASS =
	"mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end";
const STRIP_CLASS =
	"grid grid-cols-3 gap-x-4 sm:gap-x-8 lg:min-w-[30rem] [&>*+*]:border-l [&>*+*]:border-border [&>*+*]:pl-4 sm:[&>*+*]:pl-8";

export function AccountSummarySkeleton() {
	return (
		<div className={LAYOUT_CLASS} aria-hidden="true">
			<div>
				<Skeleton className="h-4 w-28" />
				<Skeleton className="mt-3 h-10 w-56" />
				<Skeleton className="mt-3 h-4 w-36" />
			</div>
			<div className={STRIP_CLASS}>
				{STRIP_CELLS.map((key) => (
					<MetricCardSkeleton key={key} variant={MetricVariant.Cell} />
				))}
			</div>
		</div>
	);
}

function winRateSub(stats: TradeStats) {
	const scratch =
		stats.breakevenTrades > 0 ? ` / ${stats.breakevenTrades} scratch` : "";
	const profitFactor = stats.profitFactor?.toFixed(2) ?? UNAVAILABLE;
	return `${stats.winningTrades}W / ${stats.losingTrades}L${scratch} · PF ${profitFactor}`;
}

export function AccountSummary({
	stats,
	isAllTime,
	isAccountWide,
}: {
	stats: TradeStats;
	isAllTime: boolean;
	isAccountWide?: boolean;
}) {
	const currency = useCurrency();
	const balanceSub = isAllTime
		? `Deposits ${formatMoney(stats.netDeposits, currency, { signed: true })}`
		: `Opened at ${formatMoney(stats.openingBalance, currency)}`;

	return (
		<section className={LAYOUT_CLASS} aria-label="Account summary">
			<div className="min-w-0">
				<MetricLabel label="Account balance">
					<p>
						{
							"Deposits minus withdrawals, plus trading P&L and broker adjustments, up to the end of the period."
						}
					</p>
				</MetricLabel>
				<p className="hero-value mt-2">
					{formatMoney(stats.totalBalance, currency)}
				</p>
				<p className="mt-2 text-sm text-muted-foreground">
					{isAccountWide ? `Account-wide · ${balanceSub}` : balanceSub}
				</p>
			</div>
			<div className={STRIP_CLASS}>
				<MetricCard
					variant={MetricVariant.Cell}
					label="Net P&L"
					value={formatMoney(stats.totalPnL, currency, { signed: true })}
					tone={toneOf(stats.totalPnL)}
					sub={`Across ${stats.totalTrades} trades`}
					definition={
						<>
							<p>
								{
									"Net P&L of trades closed in the period, plus broker adjustments such as swaps and dividends."
								}
							</p>
							<p>
								Deposits and withdrawals are not profit. They change the balance
								only.
							</p>
						</>
					}
				/>
				<MetricCard
					variant={MetricVariant.Cell}
					label="Win rate"
					value={
						stats.winRate === null
							? UNAVAILABLE
							: `${stats.winRate.toFixed(1)}%`
					}
					sub={winRateSub(stats)}
					definition={
						<>
							<p>
								Wins over wins plus losses. Breakeven (scratch) trades are left
								out of both.
							</p>
							<p>
								PF is profit factor: gross profit over gross loss. It shows —
								when no trade lost.
							</p>
						</>
					}
				/>
				<MetricCard
					variant={MetricVariant.Cell}
					label="Open positions"
					value={stats.activeTrades}
					sub="Current exposure"
				/>
			</div>
		</section>
	);
}
