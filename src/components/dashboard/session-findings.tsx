import { Link } from "@tanstack/react-router";
import { AddToReviewButton } from "@/components/dashboard/add-to-review-button";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { hourLabel } from "@/lib/date";
import { sessionFindingText } from "@/lib/insight-review";
import {
	FINDING_MIN_TRADES,
	INSIGHT_FOOTER,
	type SessionFinding,
} from "@/lib/insights";
import type { DashboardSearch } from "@/lib/journal-search";
import { plural } from "@/lib/risk-rule-format";
import { TradeStatus } from "@/lib/trade";
import { cn } from "@/lib/utils";

const LINK_CLASS =
	"rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SessionRow({
	session,
	currency,
}: {
	session: SessionFinding;
	currency: string;
}) {
	return (
		<li className="py-2 text-sm">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<span>
					<span className="font-medium">{session.name}</span>
					<span className="text-muted-foreground">
						{` · ${hourLabel(session.fromHour)}–${hourLabel(session.toHour)} UTC · ${plural(session.count, "trade")}`}
						{session.count > 0 &&
							` · avg ${formatMoney(session.avgPnl, currency)}`}
					</span>
				</span>
				{session.difference === null ? (
					<span className="text-xs text-muted-foreground">
						{`Not enough trades (${session.count} of ${FINDING_MIN_TRADES})`}
					</span>
				) : (
					<span className="flex items-center gap-3">
						<span
							className={cn(
								"font-mono tabular-nums",
								session.difference < 0 ? "text-destructive" : "text-success",
							)}
						>
							{`${formatMoney(session.difference, currency, { signed: true })} per trade`}
						</span>
						<AddToReviewButton
							text={sessionFindingText(
								{ ...session, difference: session.difference },
								currency,
							)}
							search={{ status: TradeStatus.Closed }}
						/>
					</span>
				)}
			</div>
			{session.count > 0 && (
				<details className="mt-1 text-xs">
					<summary className="cursor-pointer text-muted-foreground">
						{`Open the ${plural(session.count, "trade")} in ${session.name}`}
					</summary>
					<p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
						{session.tradeIds.map((id) => (
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
		</li>
	);
}

export function SessionFindings({
	scope,
	sessions,
}: {
	scope: { count: number; avgPnl: number };
	sessions: SessionFinding[];
}) {
	const currency = useCurrency();
	if (scope.count === 0) return null;

	return (
		<div className="surface p-3 sm:p-4">
			<p className="text-sm font-semibold">Session findings</p>
			<p className="mt-1 text-xs text-muted-foreground">
				{
					"Avg net P&L per closed trade in the session (by entry time, UTC), minus the avg of all "
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
					{plural(scope.count, "closed trade")}
				</Link>
				{` in scope (${formatMoney(scope.avgPnl, currency)}). A session needs ${FINDING_MIN_TRADES} closed trades.`}
			</p>
			<ul className="mt-3 divide-y divide-border">
				{sessions.map((session) => (
					<SessionRow
						key={session.session}
						session={session}
						currency={currency}
					/>
				))}
			</ul>
			<p className="mt-3 text-xs text-muted-foreground">{INSIGHT_FOOTER}</p>
		</div>
	);
}
