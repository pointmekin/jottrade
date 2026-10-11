import { Link } from "@tanstack/react-router";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import {
	FINDING_MIN_TRADES,
	INSIGHT_FOOTER,
	type TagFinding,
} from "@/lib/insights";
import {
	ChartGroup,
	type DashboardSearch,
	drillDownSearch,
} from "@/lib/journal-search";
import { plural } from "@/lib/risk-rule-format";
import { TradeStatus } from "@/lib/trade";
import { cn } from "@/lib/utils";

const LINK_CLASS =
	"rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TagFindings({
	scope,
	tags,
}: {
	scope: { count: number; avgPnl: number };
	tags: TagFinding[];
}) {
	const currency = useCurrency();
	if (tags.length === 0) return null;

	return (
		<div className="surface p-3 sm:p-4">
			<p className="text-sm font-semibold">Tag findings</p>
			<p className="mt-1 text-xs text-muted-foreground">
				{"Avg net P&L per closed trade with the tag, minus the avg of all "}
				<Link
					from="/dashboard"
					to="/journal"
					search={(prev: DashboardSearch) => ({
						...prev,
						status: TradeStatus.Closed,
					})}
					className={LINK_CLASS}
				>
					{plural(scope.count, "closed trade")}
				</Link>
				{` in scope (${formatMoney(scope.avgPnl, currency)}). A tag needs ${FINDING_MIN_TRADES} closed trades.`}
			</p>
			<ul className="mt-3 divide-y divide-border">
				{tags.map((tag) => (
					<li
						key={tag.key}
						className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm"
					>
						<span>
							<span className="font-medium">{tag.name}</span>
							<span className="text-muted-foreground">
								{" · "}
								<Link
									from="/dashboard"
									to="/journal"
									search={(prev: DashboardSearch) => ({
										...prev,
										...drillDownSearch(ChartGroup.Tag, tag.key),
									})}
									className={LINK_CLASS}
								>
									{plural(tag.count, "trade")}
								</Link>
								{` · avg ${formatMoney(tag.avgPnl, currency)}`}
							</span>
						</span>
						{tag.difference === null ? (
							<span className="text-xs text-muted-foreground">
								{`Not enough trades (${tag.count} of ${FINDING_MIN_TRADES})`}
							</span>
						) : (
							<span
								className={cn(
									"font-mono tabular-nums",
									tag.difference < 0 ? "text-destructive" : "text-success",
								)}
							>
								{`${formatMoney(tag.difference, currency, { signed: true })} per trade`}
							</span>
						)}
					</li>
				))}
			</ul>
			<p className="mt-3 text-xs text-muted-foreground">{INSIGHT_FOOTER}</p>
		</div>
	);
}
