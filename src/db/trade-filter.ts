import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	like,
	lte,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import { trades } from "@/db/schema";
import { tagCondition } from "@/db/trade-tags";
import { SymbolMatch, type TradeFilter } from "@/lib/analysis-scope";
import { PlanAdherence } from "@/lib/playbook-check";
import { RuleOutcome } from "@/lib/risk-rule-evaluation";
import { TradeStatus } from "@/lib/trade";
import {
	SortDirection,
	type TradeSort,
	TradeSortField,
} from "@/lib/trade-sort";

/** The scope date of every screen: closed trades by exit, other trades by entry, as in `groupTradesByDay`. */
export const tradeScopeDate = sql`case when ${trades.status} = ${TradeStatus.Closed} then coalesce(${trades.exitDate}, ${trades.entryDate}) else ${trades.entryDate} end`;

/** Encodes like the timestamp columns, so the bound is UTC in any server timezone. */
export const scopeDateBound = (iso: string) =>
	sql.param(new Date(iso), trades.entryDate);

/** A check counts only for the strategy the trade has now; a check made for another strategy is stale. */
export const tradeAdherence = sql<PlanAdherence>`case when (${trades.playbookCheck}->>'strategyId')::int = ${trades.setupId} then ${trades.playbookCheck}->>'result' else ${PlanAdherence.Unchecked} end`;

const hasRuleOutcome = (outcome: RuleOutcome) =>
	sql`exists (select 1 from jsonb_array_elements(${trades.ruleCheck}->'outcomes') as item where item->>'outcome' = ${outcome})`;

/** The worst outcome of the entry check. A check that could not read the rules stores a reason and is unknown. A trade with no check, or with no rule set, is not checked. */
export const tradeRuleCheck = sql<RuleOutcome>`case when ${hasRuleOutcome(RuleOutcome.Violated)} then ${RuleOutcome.Violated} when ${hasRuleOutcome(RuleOutcome.Unknown)} or ${trades.ruleCheck}->>'reason' is not null then ${RuleOutcome.Unknown} when ${hasRuleOutcome(RuleOutcome.Pass)} then ${RuleOutcome.Pass} else ${RuleOutcome.NotSet} end`;

/** The columns are UTC timestamps without a zone. */
const zonedPart = (
	part: "dow" | "hour",
	column: SQLWrapper,
	timeZone = "UTC",
) =>
	sql`extract(${sql.raw(part)} from ${column} at time zone 'UTC' at time zone ${timeZone})`;

function setupCondition(setupId: TradeFilter["setupId"]) {
	if (setupId === "none") return isNull(trades.setupId);
	if (setupId === undefined) return undefined;
	return eq(trades.setupId, setupId);
}

function symbolCondition({ symbol, symbolMatch }: TradeFilter) {
	if (!symbol) return undefined;
	if (symbolMatch === SymbolMatch.Exact) return eq(trades.symbol, symbol);
	return like(trades.symbol, `%${symbol.replaceAll(/[\\%_]/g, "\\$&")}%`);
}

/** A leg is a broker row grouped into a position. Only by-id reads return it. */
export const positionRow = isNull(trades.groupedIntoId);

export function tradeConditions(userId: string, filter: TradeFilter) {
	return and(
		positionRow,
		eq(trades.userId, userId),
		eq(trades.portfolioId, filter.portfolioId),
		symbolCondition(filter),
		filter.side ? eq(trades.side, filter.side) : undefined,
		filter.status ? eq(trades.status, filter.status) : undefined,
		setupCondition(filter.setupId),
		filter.adherence ? eq(tradeAdherence, filter.adherence) : undefined,
		filter.ruleCheck ? eq(tradeRuleCheck, filter.ruleCheck) : undefined,
		filter.confidence?.length
			? inArray(trades.confidence, filter.confidence)
			: undefined,
		filter.mistake?.length
			? inArray(trades.mistake, filter.mistake)
			: undefined,
		tagCondition(filter.tagIds, filter.tagMatch),
		filter.weekday === undefined
			? undefined
			: eq(zonedPart("dow", tradeScopeDate, filter.timeZone), filter.weekday),
		filter.entryHour === undefined
			? undefined
			: eq(
					zonedPart("hour", trades.entryDate, filter.timeZone),
					filter.entryHour,
				),
		filter.dateFrom
			? gte(tradeScopeDate, scopeDateBound(filter.dateFrom))
			: undefined,
		filter.dateTo
			? lte(tradeScopeDate, scopeDateBound(filter.dateTo))
			: undefined,
	);
}

const SORT_COLUMN = {
	[TradeSortField.EntryDate]: trades.entryDate,
	[TradeSortField.ScopeDate]: tradeScopeDate,
	[TradeSortField.Symbol]: trades.symbol,
	[TradeSortField.NetPnl]: trades.netPnl,
	[TradeSortField.ReturnPercent]: trades.returnPercent,
} satisfies Record<TradeSortField, SQLWrapper>;

/** The id breaks ties, so a page boundary never repeats or skips a row. */
export function tradeOrder({ sort, dir }: TradeSort) {
	if (dir === SortDirection.Asc)
		return [sql`${SORT_COLUMN[sort]} asc nulls last`, asc(trades.id)];
	return [sql`${SORT_COLUMN[sort]} desc nulls last`, desc(trades.id)];
}
