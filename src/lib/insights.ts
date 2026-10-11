import { realizedAt, type TradeRecord } from "./analytics";
import { roundCents } from "./currency";
import type { GroupSummary } from "./group-summary";
import { TradeStatus } from "./trade";

export const INSIGHT_FOOTER =
	"Association in your journal. Not a cause and not a prediction.";

/** A convention, not a statistical test: below it, a difference is too noisy to show as a finding. */
export const FINDING_MIN_TRADES = 20;

export type TagFinding = {
	key: string;
	name: string;
	count: number;
	avgPnl: number;
	/** Null when the tag has fewer than FINDING_MIN_TRADES closed trades. */
	difference: number | null;
};

/** The comparison is the whole scope (owner decision Q4), so a tag on every trade shows no difference. */
export function tagFindings(
	byTag: (GroupSummary & { key: string; name: string })[],
	scope: GroupSummary,
): TagFinding[] {
	return byTag.map(({ key, name, count, avgPnl }) => ({
		key,
		name,
		count,
		avgPnl,
		difference:
			count >= FINDING_MIN_TRADES ? roundCents(avgPnl - scope.avgPnl) : null,
	}));
}

type SizingTrade = TradeRecord & {
	id: number;
	initialRiskAmount: string | null;
};

export type RiskCohort = {
	tradeIds: number[];
	/** Trades with an initial risk. The others are unknown and stay in tradeIds. */
	withRisk: number;
	medianRisk: number | null;
};

export type SizingFinding = {
	afterLoss: RiskCohort;
	other: RiskCohort;
	/** Percent change of the after-loss median from the other median. Null when a cohort has fewer than FINDING_MIN_TRADES trades with an initial risk. */
	change: number | null;
};

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2) return sorted[middle];
	return (sorted[middle - 1] + sorted[middle]) / 2;
}

function riskCohort(trades: SizingTrade[]): RiskCohort {
	const risks = trades
		.map((trade) => Number(trade.initialRiskAmount))
		.filter((risk) => risk > 0);
	const medianRisk = median(risks);
	return {
		tradeIds: trades.map((trade) => trade.id),
		withRisk: risks.length,
		medianRisk: medianRisk === null ? null : roundCents(medianRisk),
	};
}

/** The first entry in the account after the exit of each losing trade (owner decision Q5). */
export function tradesAfterLoss(history: SizingTrade[]): Set<number> {
	const byEntry = history
		.filter((trade) => trade.status !== TradeStatus.Pending)
		.sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());
	const lossExits = history
		.filter((trade) => trade.status === TradeStatus.Closed && trade.netPnl < 0)
		.map((trade) => realizedAt(trade).getTime())
		.sort((a, b) => a - b);
	const ids = new Set<number>();
	let next = 0;
	for (const exit of lossExits) {
		while (next < byEntry.length && byEntry[next].entryDate.getTime() <= exit) {
			next++;
		}
		if (next < byEntry.length) ids.add(byEntry[next].id);
	}
	return ids;
}

/** Compares the closed trades in scope that follow a loss with all other closed trades in scope. */
export function sizingAfterLoss(
	history: SizingTrade[],
	closed: SizingTrade[],
): SizingFinding {
	const afterLossIds = tradesAfterLoss(history);
	const afterLoss = riskCohort(closed.filter((t) => afterLossIds.has(t.id)));
	const other = riskCohort(closed.filter((t) => !afterLossIds.has(t.id)));
	const isEnough =
		afterLoss.withRisk >= FINDING_MIN_TRADES &&
		other.withRisk >= FINDING_MIN_TRADES;
	const change =
		isEnough && afterLoss.medianRisk !== null && other.medianRisk
			? Math.round((afterLoss.medianRisk / other.medianRisk - 1) * 100)
			: null;
	return { afterLoss, other, change };
}
