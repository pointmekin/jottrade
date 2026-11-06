import { MetricCard } from "@/components/metric-card";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import {
	METRIC_TONE_CLASS,
	MetricVariant,
	toneOf,
	UNAVAILABLE,
} from "@/lib/metric";
import type { AccountReturn } from "@/lib/risk-metrics";
import { type Trade, TradeStatus } from "@/lib/trade";
import { cn } from "@/lib/utils";

interface TradeReturnsProps {
	trade: Pick<Trade, "status" | "returnPercent"> &
		Partial<Pick<Trade, "netPnl">>;
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

	const netPnl = trade.netPnl == null ? null : Number(trade.netPnl);

	return (
		<section
			className="flex flex-wrap items-end gap-x-12 gap-y-5"
			aria-label="Trade returns"
		>
			{netPnl !== null && (
				<div>
					<p className="field-label">{"Net P&L"}</p>
					<p
						className={cn("hero-value mt-2", METRIC_TONE_CLASS[toneOf(netPnl)])}
					>
						{formatMoney(netPnl, currency, { signed: true })}
					</p>
				</div>
			)}
			<div className="grid grid-cols-2 gap-x-8 [&>*+*]:border-l [&>*+*]:border-border [&>*+*]:pl-8">
				<MetricCard
					variant={MetricVariant.Cell}
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
					variant={MetricVariant.Cell}
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
			</div>
		</section>
	);
}
