import { roundCents } from "./currency";
import { PlanAdherence } from "./playbook-check";
import type { TradeTag } from "./trade-tag";

export type GroupSummary = {
	count: number;
	wins: number;
	losses: number;
	breakeven: number;
	totalPnl: number;
	avgPnl: number;
	winRate: number | null;
};

/** A breakeven trade is neither a win nor a loss, so it is out of both sides of the ratio. */
export function winRateOf(wins: number, losses: number): number | null {
	const decided = wins + losses;
	return decided > 0 ? (wins / decided) * 100 : null;
}

export function summarizeGroup(pnls: number[]): GroupSummary {
	const wins = pnls.filter((pnl) => pnl > 0).length;
	const losses = pnls.filter((pnl) => pnl < 0).length;
	const totalPnl = roundCents(pnls.reduce((a, b) => a + b, 0));
	return {
		count: pnls.length,
		wins,
		losses,
		breakeven: pnls.length - wins - losses,
		totalPnl,
		avgPnl: pnls.length ? roundCents(totalPnl / pnls.length) : 0,
		winRate: winRateOf(wins, losses),
	};
}

export function summarizeGroups<T, K>(
	items: T[],
	keyOf: (item: T) => K,
	pnlOf: (item: T) => number,
): Map<K, GroupSummary> {
	const pnlsByKey = new Map<K, number[]>();
	for (const item of items) {
		const key = keyOf(item);
		const pnls = pnlsByKey.get(key);
		if (pnls) pnls.push(pnlOf(item));
		else pnlsByKey.set(key, [pnlOf(item)]);
	}
	return new Map(
		Array.from(pnlsByKey, ([key, pnls]) => [key, summarizeGroup(pnls)]),
	);
}

/** A trade with several tags is in each of their groups, so the groups can add up to more than the scope. */
export function summarizeTagGroups(
	trades: { id: number; netPnl: number }[],
	tagsByTrade: Map<number, TradeTag[]>,
) {
	const tagged = trades.flatMap((trade) =>
		(tagsByTrade.get(trade.id) ?? []).map((tag) => ({
			tag,
			netPnl: trade.netPnl,
		})),
	);
	const names = new Map(tagged.map(({ tag }) => [tag.id, tag.name]));
	return Array.from(
		summarizeGroups(
			tagged,
			({ tag }) => tag.id,
			({ netPnl }) => netPnl,
		),
		([id, summary]) => ({
			key: String(id),
			name: names.get(id) ?? "",
			...summary,
		}),
	);
}

/** Each trade is in one bucket. With no checked trade, the groups would only repeat the scope, so there is none. */
export function summarizeCheckGroups<B extends string>(
	trades: { id: number; netPnl: number }[],
	bucketOf: Map<number, B>,
	labels: Record<B, string>,
	unchecked: B,
) {
	const groups = summarizeGroups(
		trades,
		(trade) => bucketOf.get(trade.id) ?? unchecked,
		(trade) => trade.netPnl,
	);
	if (!Array.from(groups.keys()).some((key) => key !== unchecked)) return [];
	return (Object.entries(labels) as [B, string][]).flatMap(([key, name]) => {
		const summary = groups.get(key);
		return summary ? [{ key, name, ...summary }] : [];
	});
}

export const countTagged = (
	trades: { id: number }[],
	tagsByTrade: Map<number, TradeTag[]>,
) => trades.filter((trade) => tagsByTrade.get(trade.id)?.length).length;

export const countChecked = <B extends string>(
	trades: { id: number }[],
	bucketOf: Map<number, B>,
	unchecked: B,
) =>
	trades.filter((trade) => (bucketOf.get(trade.id) ?? unchecked) !== unchecked)
		.length;

export function summarizeAdherence(
	rows: { netPnl: number; adherence: PlanAdherence }[],
) {
	const summarize = (adherence?: PlanAdherence) =>
		summarizeGroup(
			rows
				.filter((row) => !adherence || row.adherence === adherence)
				.map((row) => row.netPnl),
		);
	return {
		all: summarize(),
		[PlanAdherence.Followed]: summarize(PlanAdherence.Followed),
		[PlanAdherence.Broken]: summarize(PlanAdherence.Broken),
		[PlanAdherence.Unchecked]: summarize(PlanAdherence.Unchecked),
	};
}
