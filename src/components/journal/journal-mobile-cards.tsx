import { Link } from "@tanstack/react-router";
import type { AccountEntryRecord } from "@/lib/account-entry";
import { formatMoney } from "@/lib/currency";
import { formatEntryDate, toNumber } from "@/lib/journal-format";
import { UNAVAILABLE } from "@/lib/metric";
import type { Trade } from "@/lib/trade";
import { cn } from "@/lib/utils";
import { AdjustmentPill, Money, SidePill } from "./journal-cells";

function PriceField({
	label,
	value,
	currency,
}: {
	label: string;
	value: string | null;
	currency: string;
}) {
	return (
		<div>
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="font-data text-xs text-foreground">
				{value ? formatMoney(Number(value), currency) : UNAVAILABLE}
			</p>
		</div>
	);
}

export function TradeCard({
	trade,
	currency,
}: {
	trade: Trade;
	currency: string;
}) {
	const returnPercent = toNumber(trade.returnPercent);
	const entryDate = formatEntryDate(trade.entryDate);

	return (
		<Link
			to="/journal/$tradeId"
			params={{ tradeId: String(trade.id) }}
			className="surface block min-h-11 p-3 transition-colors hover:bg-accent/45 focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-[3px]"
			aria-label={`Review ${trade.symbol} ${trade.side} trade from ${entryDate}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold tracking-tight text-foreground">
							{trade.symbol}
						</span>
						<SidePill side={trade.side} />
						<span className="status-pill bg-muted text-muted-foreground">
							{trade.status ?? UNAVAILABLE}
						</span>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">{entryDate}</p>
				</div>
				<div className="shrink-0 text-right">
					<p className="text-sm">
						<Money value={toNumber(trade.netPnl)} currency={currency} signed />
					</p>
					<p className="text-xs text-muted-foreground">{"net P&L"}</p>
				</div>
			</div>
			<div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2.5">
				<PriceField
					label="Entry"
					value={trade.entryPrice}
					currency={currency}
				/>
				<PriceField label="Exit" value={trade.exitPrice} currency={currency} />
				<div>
					<p className="text-xs text-muted-foreground">Qty</p>
					<p className="font-data text-xs text-foreground">
						{trade.quantity || UNAVAILABLE}
					</p>
				</div>
			</div>
			{returnPercent !== null && (
				<p
					className={cn(
						"mt-2 text-right font-data text-xs font-medium",
						returnPercent >= 0 ? "text-success" : "text-destructive",
					)}
				>
					{`${returnPercent >= 0 ? "+" : ""}${returnPercent.toFixed(2)}% price return`}
				</p>
			)}
		</Link>
	);
}

export function AdjustmentCard({
	adjustment,
	currency,
}: {
	adjustment: AccountEntryRecord;
	currency: string;
}) {
	return (
		<div className="surface block min-h-11 bg-muted/35 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold tracking-tight text-foreground">
							Account adjustment
						</span>
						<AdjustmentPill />
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{formatEntryDate(adjustment.occurredAt)}
					</p>
				</div>
				<div className="shrink-0 text-right">
					<p className="text-sm">
						<Money value={adjustment.amount} currency={currency} signed />
					</p>
					<p className="text-xs text-muted-foreground">balance change</p>
				</div>
			</div>
			{adjustment.note && (
				<p className="mt-3 truncate border-t border-border pt-2.5 text-xs text-muted-foreground">
					{adjustment.note}
				</p>
			)}
		</div>
	);
}
