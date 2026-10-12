import {
	type BrokerRecord,
	type ImportCandidate,
	ImportKind,
} from "@/lib/import-batch";
import { TradeStatus } from "@/lib/trade";
import { calculateRealizedR } from "@/lib/trade-risk";

export function ImportRiskEffect({
	candidate,
	incoming,
	currency,
}: {
	candidate: ImportCandidate;
	incoming: BrokerRecord;
	currency: string;
}) {
	if (
		incoming.kind !== ImportKind.Trades ||
		candidate.snapshot.kind !== ImportKind.Trades
	)
		return null;
	const value = (record: typeof incoming) => {
		const result = calculateRealizedR(
			{
				status:
					record.status === TradeStatus.Closed
						? TradeStatus.Closed
						: TradeStatus.Open,
				netPnl: record.netPnl,
				initialRiskAmount: candidate.initialRiskAmount,
				initialRiskSnapshot: candidate.initialRiskSnapshot,
			},
			currency,
		);
		return result === null ? "Unavailable" : `${result.toFixed(2)}R`;
	};
	return (
		<p className="mt-2 text-xs">
			Realized net R if corrected: {value(candidate.snapshot)} →{" "}
			{value(incoming)}. The original risk plan stays unchanged.
		</p>
	);
}
