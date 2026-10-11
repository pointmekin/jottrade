import { formatMoney } from "@/lib/currency";
import { resolveInstrumentSpec } from "@/lib/instruments";
import { ExecutionKind, formatQuantity } from "@/lib/position";
import type { ReviewFillSnapshot } from "@/lib/review";

function fillLabel(fill: ReviewFillSnapshot, unit: string, currency: string) {
	const quantity = `${formatQuantity(Number(fill.quantity))} ${unit}`;
	if (fill.kind === ExecutionKind.Entry)
		return `Entry ${quantity} at ${Number(fill.price)}`;
	const realized =
		fill.realizedPnl === null
			? "P&L not known"
			: formatMoney(Number(fill.realizedPnl), currency, { signed: true });
	if (fill.closesPosition)
		return `Final exit ${quantity} · ${realized} · position closed`;
	return `Partial exit ${quantity} · ${realized} · position still open`;
}

export function ReviewSourceFills({
	symbol,
	fills,
	currency,
}: {
	symbol: string;
	fills: ReviewFillSnapshot[];
	currency: string;
}) {
	const unit = resolveInstrumentSpec(symbol).quantityUnit.toLowerCase();
	return (
		<ul className="font-data text-xs tabular-nums text-muted-foreground">
			{fills.map((fill) => (
				<li key={`${fill.executedAt}-${fill.kind}-${fill.quantity}`}>
					{fillLabel(fill, unit, currency)}
				</li>
			))}
		</ul>
	);
}
