import { Link } from "@tanstack/react-router";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import {
	INSIGHT_FOOTER,
	type Insight,
	InsightFormula,
	MIN_COHORT_TRADES,
} from "@/lib/insights";
import { type DashboardSearch, drillDownSearch } from "@/lib/journal-search";
import { TradeStatus } from "@/lib/trade";

const COHORT_KIND = {
	[InsightFormula.TagAvgPnlVsScope]: "Tag",
	[InsightFormula.SessionAvgPnlVsScope]: "Session",
} satisfies Record<InsightFormula, string>;

const LINK_CLASS =
	"underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

function InsightRow({ insight }: { insight: Insight }) {
	const currency = useCurrency();
	const money = (value: number, signed = false) =>
		formatMoney(value, currency, { signed });
	const { cohort, comparison, difference } = insight;

	return (
		<li className="space-y-1 py-3">
			<p className="text-sm font-medium">
				{`${COHORT_KIND[insight.formula]}: ${insight.name}`}
			</p>
			{difference === null ? (
				<p className="text-xs text-muted-foreground">
					{`Not enough trades (${insight.sample} of ${MIN_COHORT_TRADES})`}
				</p>
			) : (
				<p className="font-mono text-sm">
					<span
						className={difference >= 0 ? "text-success" : "text-destructive"}
					>
						{`${money(difference, true)} per trade`}
					</span>
					<span className="text-muted-foreground">
						{` · ${money(cohort.avgPnl)} vs ${money(comparison.avgPnl)} avg P&L`}
					</span>
				</p>
			)}
			<p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
				<Link
					from="/dashboard"
					to="/journal"
					search={(prev: DashboardSearch) => ({
						...prev,
						...drillDownSearch(insight.group, insight.key),
					})}
					className={LINK_CLASS}
				>
					{`Open ${cohort.count} trades`}
				</Link>
				<Link
					from="/dashboard"
					to="/journal"
					search={(prev: DashboardSearch) => ({
						...prev,
						status: TradeStatus.Closed,
					})}
					className={LINK_CLASS}
				>
					{`Open ${comparison.count} trades in scope`}
				</Link>
			</p>
		</li>
	);
}

export function InsightsList({ insights }: { insights: Insight[] }) {
	if (!insights.length) return null;
	return (
		<div className="surface p-3 sm:p-4">
			<p className="text-sm font-semibold">Insights</p>
			<p className="mt-1 text-xs text-muted-foreground">
				{`The difference in average P&L per closed trade between a group and all closed trades in scope. A group needs ${MIN_COHORT_TRADES} closed trades. Sessions use the entry time in UTC.`}
			</p>
			<ul className="divide-y divide-border">
				{insights.map((insight) => (
					<InsightRow
						key={`${insight.formula}:${insight.key}`}
						insight={insight}
					/>
				))}
			</ul>
			<p className="mt-1 text-xs text-muted-foreground">{INSIGHT_FOOTER}</p>
		</div>
	);
}
