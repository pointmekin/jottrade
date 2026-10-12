import { formatMoney } from "@/lib/currency";
import type { ReviewResultSnapshot } from "@/lib/review";
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
			? "Unavailable"
			: formatMoney(Number(value), currency, { signed: true });
	return (
		<section className="surface space-y-3 p-4">
			<h2 className="font-semibold">{label}</h2>
			<dl className="grid grid-cols-2 gap-3 text-sm">
				<div>
					<dt className="text-muted-foreground">Closed trade P&L</dt>
					<dd>{money(results.tradePnl)}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Broker adjustments</dt>
					<dd>{money(results.adjustmentPnl)}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Trading result</dt>
					<dd>{money(results.tradingPnl)}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Net deposits / withdrawals</dt>
					<dd>{money(results.netDeposits)}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Closed trades</dt>
					<dd>{results.closedTradeCount}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Win rate</dt>
					<dd>
						{results.winRate === null
							? "Unavailable"
							: `${results.winRate.toFixed(1)}%`}
					</dd>
				</div>
			</dl>
			{results.missingPnlCount > 0 && (
				<p className="text-xs text-muted-foreground">
					{results.missingPnlCount} closed trades have missing P&L.
				</p>
			)}
		</section>
	);
}
