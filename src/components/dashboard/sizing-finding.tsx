import { Link } from "@tanstack/react-router";
import { AddToReviewButton } from "@/components/dashboard/add-to-review-button";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { sizingFindingText } from "@/lib/insight-review";
import {
	FINDING_MIN_TRADES,
	type SizingFinding as Finding,
	INSIGHT_FOOTER,
	type RiskCohort,
} from "@/lib/insights";
import type { DashboardSearch } from "@/lib/journal-search";
import { plural } from "@/lib/risk-rule-format";
import { TradeStatus } from "@/lib/trade";

const LINK_CLASS =
	"rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function CohortLine({
	label,
	cohort,
	currency,
}: {
	label: string;
	cohort: RiskCohort;
	currency: string;
}) {
	const median =
		cohort.medianRisk === null
			? "no median"
			: `median ${formatMoney(cohort.medianRisk, currency)}`;
	return (
		<p>
			<span className="font-medium">{label}</span>
			<span className="text-muted-foreground">
				{` · ${cohort.withRisk} of ${plural(cohort.tradeIds.length, "trade")} with initial risk · ${median}`}
			</span>
		</p>
	);
}

export function SizingFinding({ sizing }: { sizing: Finding }) {
	const currency = useCurrency();
	const { afterLoss, other, change } = sizing;
	const total = afterLoss.tradeIds.length + other.tradeIds.length;
	if (total === 0) return null;
	const smallest = Math.min(afterLoss.withRisk, other.withRisk);

	return (
		<div className="surface p-3 sm:p-4">
			<p className="text-sm font-semibold">Sizing after a loss</p>
			<p className="mt-1 text-xs text-muted-foreground">
				{
					"Median initial risk of the first trade after a losing trade, against the median of the other "
				}
				<Link
					from="/dashboard"
					to="/journal"
					search={(prev: DashboardSearch) => ({
						...prev,
						status: TradeStatus.Closed,
					})}
					className={LINK_CLASS}
				>
					{plural(total, "closed trade")}
				</Link>
				{` in scope. Each group needs ${FINDING_MIN_TRADES} trades with initial risk.`}
			</p>
			<div className="mt-3 space-y-1 text-sm">
				<CohortLine
					label="After a loss"
					cohort={afterLoss}
					currency={currency}
				/>
				<CohortLine label="Other" cohort={other} currency={currency} />
			</div>
			<div className="mt-2 text-sm">
				{change === null ? (
					<span className="text-xs text-muted-foreground">
						{`Not enough trades with initial risk (${smallest} of ${FINDING_MIN_TRADES})`}
					</span>
				) : (
					<span className="flex flex-wrap items-center gap-3">
						<span className="font-mono tabular-nums">
							{`${change > 0 ? "+" : ""}${change}% median risk after a loss`}
						</span>
						<AddToReviewButton
							text={sizingFindingText({ ...sizing, change })}
							search={{ status: TradeStatus.Closed }}
						/>
					</span>
				)}
			</div>
			{afterLoss.tradeIds.length > 0 && (
				<details className="mt-2 text-xs">
					<summary className="cursor-pointer text-muted-foreground">
						{`Open the ${plural(afterLoss.tradeIds.length, "trade")} after a loss`}
					</summary>
					<p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
						{afterLoss.tradeIds.map((id) => (
							<Link
								key={id}
								to="/journal/$tradeId"
								params={{ tradeId: String(id) }}
								className={LINK_CLASS}
							>
								{`#${id}`}
							</Link>
						))}
					</p>
				</details>
			)}
			<p className="mt-3 text-xs text-muted-foreground">{INSIGHT_FOOTER}</p>
		</div>
	);
}
