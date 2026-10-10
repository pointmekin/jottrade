import { Link } from "@tanstack/react-router";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import type { GroupSummary, summarizeAdherence } from "@/lib/group-summary";
import { UNAVAILABLE } from "@/lib/metric";
import { PLAN_ADHERENCE_LABEL, PlanAdherence } from "@/lib/playbook-check";
import { TradeStatus } from "@/lib/trade";

interface StrategyAdherenceProps {
	strategyId: number;
	performance: ReturnType<typeof summarizeAdherence>;
}

function AdherenceStats({
	strategyId,
	adherence,
	summary,
}: {
	strategyId: number;
	adherence: PlanAdherence;
	summary: GroupSummary;
}) {
	const currency = useCurrency();
	const money = (value: number) =>
		formatMoney(value, currency, { signed: true });
	const stats = [
		{
			term: "Win rate",
			value:
				summary.winRate === null
					? UNAVAILABLE
					: `${summary.winRate.toFixed(1)}%`,
		},
		{ term: "Avg P&L", value: money(summary.avgPnl) },
		{ term: "Total P&L", value: money(summary.totalPnl) },
	];
	return (
		<>
			<dl className="grid grid-cols-3 gap-2">
				{stats.map(({ term, value }) => (
					<div key={term} className="min-w-0">
						<dt className="field-label">{term}</dt>
						<dd className="font-data text-sm font-semibold">{value}</dd>
					</div>
				))}
			</dl>
			<Link
				to="/journal"
				search={{
					setupId: String(strategyId),
					adherence,
					status: TradeStatus.Closed,
				}}
				className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				Open {summary.count} {summary.count === 1 ? "trade" : "trades"}
			</Link>
		</>
	);
}

/** "Followed" is the trader's own answer in review, not a measured fact. */
export function StrategyAdherence({
	strategyId,
	performance,
}: StrategyAdherenceProps) {
	const isChecked =
		performance[PlanAdherence.Followed].count +
			performance[PlanAdherence.Broken].count >
		0;
	return (
		<section className="space-y-3 pt-3" aria-label="Plan adherence">
			<div>
				<h3 className="text-sm font-semibold">Plan adherence</h3>
				<p className="field-label">
					You marked each trade Followed or Broke in its review.
				</p>
			</div>
			{!isChecked && (
				<p className="text-sm text-muted-foreground">
					Check trades in review to compare followed and broken trades.
				</p>
			)}
			<ul className="grid gap-3 sm:grid-cols-3">
				{Object.values(PlanAdherence).map((adherence) => {
					const summary = performance[adherence];
					const label = PLAN_ADHERENCE_LABEL[adherence];
					return (
						<li
							key={adherence}
							aria-label={label}
							className="surface space-y-2 p-3"
						>
							<div className="flex items-baseline justify-between gap-2">
								<span className="text-sm font-medium">{label}</span>
								<span className="font-data text-xs text-muted-foreground">
									{`n = ${summary.count}`}
								</span>
							</div>
							{summary.count === 0 && (
								<p className="text-sm text-muted-foreground">No trades</p>
							)}
							{summary.count > 0 && (
								<AdherenceStats
									strategyId={strategyId}
									adherence={adherence}
									summary={summary}
								/>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
