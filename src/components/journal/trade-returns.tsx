import type { ReactNode } from "react";
import { MetricLabel } from "@/components/metric-label";
import { type AccountReturn, TradeStatus } from "@/lib/analytics";
import { formatMoney } from "@/lib/currency";

interface TradeReturnsProps {
	status: string | null;
	returnPercent: string | null;
	accountReturn: AccountReturn;
	currency: string;
}

const NOT_CLOSED = "Trade is not closed";

function ReturnCell({
	label,
	definition,
	percent,
	sub,
}: {
	label: string;
	definition: ReactNode;
	percent: number | null;
	sub: string;
}) {
	let color = "";
	if (percent !== null)
		color = percent >= 0 ? "text-success" : "text-destructive";
	return (
		<div className="surface p-3">
			<MetricLabel label={label}>{definition}</MetricLabel>
			<p className={`mt-1 font-data text-sm font-semibold ${color}`}>
				{percent === null ? "—" : `${percent.toFixed(2)}%`}
			</p>
			<p className="mt-1 text-xs text-muted-foreground">{sub}</p>
		</div>
	);
}

export function TradeReturns({
	status,
	returnPercent,
	accountReturn,
	currency,
}: TradeReturnsProps) {
	const isClosed = status === TradeStatus.Closed;
	const priceReturn = returnPercent === null ? null : Number(returnPercent);

	let priceSub = "Entry to exit price";
	if (priceReturn === null)
		priceSub = isClosed ? "Needs an entry and an exit price" : NOT_CLOSED;

	let accountSub = `Of ${formatMoney(accountReturn.balanceAtEntry, currency)} at entry`;
	if (!isClosed) accountSub = NOT_CLOSED;
	else if (accountReturn.percent === null)
		accountSub = "No positive balance at entry";

	return (
		<section className="grid grid-cols-2 gap-3" aria-label="Trade returns">
			<ReturnCell
				label="Price return"
				percent={priceReturn}
				sub={priceSub}
				definition={
					<p>
						The move from entry to exit as a percent of the entry price. Fees,
						leverage, swaps and currency conversion are not in it.
					</p>
				}
			/>
			<ReturnCell
				label="Account return"
				percent={accountReturn.percent}
				sub={accountSub}
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
