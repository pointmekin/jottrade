import { type BrokerRecord, ImportKind } from "@/lib/import-batch";
export function ImportExecutionFacts({ record }: { record: BrokerRecord }) {
	let facts: Record<string, string | null>;
	if (record.kind === ImportKind.Trades)
		facts = {
			Ticket: record.brokerTicket,
			Symbol: record.symbol,
			Side: record.side,
			"Opening time UTC": record.entryDate,
			"Closing time UTC": record.exitDate,
			"Opening price": record.entryPrice,
			"Closing price": record.exitPrice,
			Quantity: record.quantity,
			"Gross profit": record.brokerProfit,
			"Signed commission": record.brokerCommission,
			"Signed swap": record.brokerSwap,
			"Broker net": record.netPnl,
		};
	else
		facts = {
			Position: record.brokerAdjustment?.positionId ?? null,
			Symbol: record.brokerAdjustment?.symbol ?? null,
			"Occurred UTC": record.occurredAt,
			"Signed amount": record.amount,
		};
	return (
		<dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
			{Object.entries(facts).map(([label, value]) => (
				<div key={label}>
					<dt className="text-muted-foreground">{label}</dt>
					<dd className="break-all">{value ?? "Unavailable"}</dd>
				</div>
			))}
		</dl>
	);
}
