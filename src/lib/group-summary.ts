import { roundCents } from "./currency";

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
