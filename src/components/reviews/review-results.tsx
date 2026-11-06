import { formatMoney } from "@/lib/currency";
import { METRIC_TONE_CLASS, toneOf } from "@/lib/metric";
import type { ReviewResultSnapshot } from "@/lib/review";
import { cn } from "@/lib/utils";

const UNAVAILABLE_TEXT = "Unavailable";

export function ReviewResults({
	results,
	currency,
	label,
}: {
	results: ReviewResultSnapshot;
	currency: string;
	label: string;
}) {
	const money = (value: string | null) =>
		value === null
			? UNAVAILABLE_TEXT
			: formatMoney(Number(value), currency, { signed: true });
	const tradingPnl =
		results.tradingPnl === null ? null : Number(results.tradingPnl);
	const rows: [string, string | number][] = [
		["Realized trade P&L", money(results.tradePnl)],
		["Broker adjustments", money(results.adjustmentPnl)],
		["Net deposits / withdrawals", money(results.netDeposits)],
		["Closed trades", results.closedTradeCount],
		[
			"Win rate",
			results.winRate === null
				? UNAVAILABLE_TEXT
				: `${results.winRate.toFixed(1)}%`,
		],
	];
	return (
		<section className="surface space-y-4 p-4" aria-label={label}>
			<div>
				<h2 className="text-sm font-semibold">{label}</h2>
				<p className="field-label mt-3">Trading result</p>
				<p
					className={cn(
						"metric-value mt-1",
						tradingPnl !== 0 && METRIC_TONE_CLASS[toneOf(tradingPnl)],
					)}
				>
					{money(results.tradingPnl)}
				</p>
			</div>
			<dl className="space-y-2 border-t border-border pt-3 text-sm">
				{rows.map(([term, value]) => (
					<div key={term} className="flex items-baseline justify-between gap-3">
						<dt className="text-muted-foreground">{term}</dt>
						<dd className="font-data">{value}</dd>
					</div>
				))}
			</dl>
			{results.missingPnlCount > 0 && (
				<p className="text-xs text-muted-foreground">
					{results.missingPnlCount} closed trades have missing P&L.
				</p>
			)}
		</section>
	);
}
