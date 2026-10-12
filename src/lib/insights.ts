import { roundCents } from "./currency";
import { summarizeGroup } from "./group-summary";
import { ChartGroup } from "./journal-search";
import type { TradeTag } from "./trade-tag";
import { sessionLabel, sessionOf, TradingSession } from "./trading-session";

export const INSIGHT_FOOTER =
	"Association in your journal. Not a cause and not a prediction.";

/** A convention, not a statistical test: each cohort needs this many closed trades. */
export const MIN_COHORT_TRADES = 20;
const TOP_TAGS = 10;

export const InsightFormula = {
	TagAvgPnlVsScope: "tag-avg-pnl-vs-scope",
	SessionAvgPnlVsScope: "session-avg-pnl-vs-scope",
} as const;

export type InsightFormula =
	(typeof InsightFormula)[keyof typeof InsightFormula];

type InsightTrade = { id: number; netPnl: number; entryDate: Date };

export type InsightContext = {
	portfolioId: number;
	period: { from: string | null; to: string | null };
};

function cohortOf(trades: InsightTrade[]) {
	const { count, totalPnl, avgPnl } = summarizeGroup(
		trades.map((trade) => trade.netPnl),
	);
	return { tradeIds: trades.map((trade) => trade.id), count, totalPnl, avgPnl };
}

/** `difference` is null below the minimum sample, so the list shows "Not enough trades". */
function compare(
	head: {
		formula: InsightFormula;
		group: ChartGroup;
		key: string;
		name: string;
	},
	cohortTrades: InsightTrade[],
	comparisonTrades: InsightTrade[],
	context: InsightContext,
) {
	const cohort = cohortOf(cohortTrades);
	const comparison = cohortOf(comparisonTrades);
	const sample = Math.min(cohort.count, comparison.count);
	return {
		...head,
		...context,
		cohort,
		comparison,
		sample,
		difference:
			sample >= MIN_COHORT_TRADES
				? roundCents(cohort.avgPnl - comparison.avgPnl)
				: null,
	};
}

export type Insight = ReturnType<typeof compare>;

/** The cohorts of the 10 most used tags, as the tag chart. */
function tagInsights(
	trades: InsightTrade[],
	tagsByTrade: Map<number, TradeTag[]>,
	context: InsightContext,
) {
	const byTag = new Map<number, { tag: TradeTag; trades: InsightTrade[] }>();
	for (const trade of trades) {
		for (const tag of tagsByTrade.get(trade.id) ?? []) {
			const entry = byTag.get(tag.id);
			if (entry) entry.trades.push(trade);
			else byTag.set(tag.id, { tag, trades: [trade] });
		}
	}
	return Array.from(byTag.values())
		.sort((a, b) => b.trades.length - a.trades.length)
		.slice(0, TOP_TAGS)
		.map(({ tag, trades: cohort }) =>
			compare(
				{
					formula: InsightFormula.TagAvgPnlVsScope,
					group: ChartGroup.Tag,
					key: String(tag.id),
					name: tag.name,
				},
				cohort,
				trades,
				context,
			),
		);
}

function sessionInsights(trades: InsightTrade[], context: InsightContext) {
	return Object.values(TradingSession).flatMap((session) => {
		const cohort = trades.filter(
			(trade) => sessionOf(trade.entryDate) === session,
		);
		if (!cohort.length) return [];
		return [
			compare(
				{
					formula: InsightFormula.SessionAvgPnlVsScope,
					group: ChartGroup.Session,
					key: session,
					name: sessionLabel(session),
				},
				cohort,
				trades,
				context,
			),
		];
	});
}

/**
 * Compares the average P&L per closed trade of each cohort with the whole
 * scope. `tagsByTrade` is null under a tag filter, because the tag cohort
 * would then not open the same trades.
 */
export function findInsights(
	trades: InsightTrade[],
	tagsByTrade: Map<number, TradeTag[]> | null,
	context: InsightContext,
): Insight[] {
	return [
		...(tagsByTrade ? tagInsights(trades, tagsByTrade, context) : []),
		...sessionInsights(trades, context),
	];
}
