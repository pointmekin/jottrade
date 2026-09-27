import { MetricCard } from "@/components/metric-card";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { MetricVariant, toneOf, UNAVAILABLE } from "@/lib/metric";
import type { AccountReturn } from "@/lib/risk-metrics";
import { type Trade, TradeStatus } from "@/lib/trade";

interface TradeReturnsProps {
	trade: Pick<Trade, "status" | "returnPercent">;
	accountReturn: AccountReturn;
}

const NOT_CLOSED = "Trade is not closed";

const formatPercent = (percent: number | null) =>
	percent === null ? UNAVAILABLE : `${percent.toFixed(2)}%`;

function priceReturnSub(isClosed: boolean, priceReturn: number | null) {
	if (!isClosed) return NOT_CLOSED;
	if (priceReturn === null) return "Needs an entry and an exit price";
	return "Entry to exit price";
}

function accountReturnSub(
	isClosed: boolean,
	{ percent, balanceAtEntry }: AccountReturn,
	currency: string,
) {
	if (!isClosed) return NOT_CLOSED;
	if (percent === null) return "No positive balance at entry";
	return `Of ${formatMoney(balanceAtEntry, currency)} at entry`;
}

export function TradeReturns({ trade, accountReturn }: TradeReturnsProps) {
	const currency = useCurrency();
	const isClosed = trade.status === TradeStatus.Closed;
	const priceReturn =
		trade.returnPercent === null ? null : Number(trade.returnPercent);

	return (
		<section className="grid grid-cols-2 gap-3" aria-label="Trade returns">
			<MetricCard
				variant={MetricVariant.Compact}
				label="Price return"
				value={formatPercent(priceReturn)}
				tone={toneOf(priceReturn)}
				sub={priceReturnSub(isClosed, priceReturn)}
				definition={
					<p>
						The move from entry to exit as a percent of the entry price. Fees,
						leverage, swaps and currency conversion are not in it.
					</p>
				}
			/>
			<MetricCard
				variant={MetricVariant.Compact}
				label="Account return"
				value={formatPercent(accountReturn.percent)}
				tone={toneOf(accountReturn.percent)}
				sub={accountReturnSub(isClosed, accountReturn, currency)}
				definition={
					<p>
						{
							"Net P&L over the account balance just before entry. That balance is every deposit, withdrawal, adjustment and closed trade before the entry time."
						}
					</p>
				}
			/>
		</section>
	);
}
