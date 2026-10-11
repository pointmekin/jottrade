import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
	loadAccountHistory,
	loadMatchingTrades,
	loadTradeChecks,
} from "@/db/account-history";
import { strategies } from "@/db/schema";
import { loadTagsByTrade } from "@/db/trade-tags";
import { analysisScopeSchema, toDateRange } from "@/lib/analysis-scope";
import {
	closedTradesInRange,
	realizedAt,
	summarizeTrades,
} from "@/lib/analytics";
import {
	hourLabel,
	toDayKey,
	WEEKDAY_NAMES,
	zonedDayOfWeek,
	zonedHour,
} from "@/lib/date";
import {
	countChecked,
	countTagged,
	summarizeCheckGroups,
	summarizeGroup,
	summarizeGroups,
	summarizeTagGroups,
} from "@/lib/group-summary";
import { NO_STRATEGY } from "@/lib/journal-search";
import { PLAN_ADHERENCE_LABEL, PlanAdherence } from "@/lib/playbook-check";
import {
	computeAvgHoldTime,
	computeMaxDrawdown,
	computePayoffRatio,
	computeSharpe,
} from "@/lib/risk-metrics";
import { RuleOutcome } from "@/lib/risk-rule-evaluation";
import { RULE_CHECK_GROUP_TEXT } from "@/lib/rule-check-text";
import { authMiddleware } from "./auth-middleware";

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
const TOP_GROUPS = 10;

export const getAdvancedAnalytics = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(analysisScopeSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const range = toDateRange(data);
		const [history, matching, userStrategies, checks] = await Promise.all([
			loadAccountHistory(userId, data.portfolioId),
			loadMatchingTrades(userId, data),
			db.select().from(strategies).where(eq(strategies.userId, userId)),
			loadTradeChecks(userId, data.portfolioId),
		]);

		const closed = closedTradesInRange(matching ?? history.trades, range);
		const pnlOf = (trade: (typeof closed)[number]) => trade.netPnl;
		const { equityCurve } = summarizeTrades(
			history.trades,
			history.cashFlows,
			range,
			data.timeZone,
		);
		const now = new Date();
		const windowEnd = range.to && range.to < now ? range.to : now;

		const riskMetrics = {
			closedTrades: closed.length,
			sharpe: computeSharpe(equityCurve, toDayKey(windowEnd, data.timeZone)),
			maxDrawdown: computeMaxDrawdown(equityCurve),
			payoff: computePayoffRatio(closed),
			avgHoldTimeHours: computeAvgHoldTime(closed),
		};

		const strategyNames = new Map(userStrategies.map((s) => [s.id, s.name]));
		const byStrategy = Array.from(
			summarizeGroups(closed, (trade) => trade.setupId, pnlOf),
			([setupId, summary]) => ({
				key: setupId === null ? NO_STRATEGY : String(setupId),
				name:
					setupId === null
						? "Unassigned"
						: (strategyNames.get(setupId) ?? "Unknown"),
				...summary,
			}),
		);

		const bySymbol = Array.from(
			summarizeGroups(closed, (trade) => trade.symbol, pnlOf),
			([name, summary]) => ({ key: name, name, ...summary }),
		)
			.sort((a, b) => b.count - a.count)
			.slice(0, TOP_GROUPS);

		const dayGroups = summarizeGroups(
			closed,
			(trade) => zonedDayOfWeek(realizedAt(trade), data.timeZone),
			pnlOf,
		);
		const byDayOfWeek = MONDAY_FIRST.map((day) => ({
			key: String(day),
			name: WEEKDAY_NAMES[day],
			...(dayGroups.get(day) ?? summarizeGroup([])),
		}));

		const byHour = Array.from(
			summarizeGroups(
				closed,
				(trade) => zonedHour(trade.entryDate, data.timeZone),
				pnlOf,
			),
		)
			.sort(([a], [b]) => a - b)
			.map(([hour, summary]) => ({
				key: String(hour),
				name: hourLabel(hour),
				...summary,
			}));

		// Under a tag filter, a tag bar would not open the same trades as its drill-down.
		const tagsByTrade = data.tagIds?.length
			? new Map()
			: await loadTagsByTrade(
					userId,
					closed.map((trade) => trade.id),
				);
		const byTag = summarizeTagGroups(closed, tagsByTrade)
			.sort((a, b) => b.count - a.count)
			.slice(0, TOP_GROUPS);

		const byAdherence = summarizeCheckGroups(
			closed,
			checks.adherence,
			PLAN_ADHERENCE_LABEL,
			PlanAdherence.Unchecked,
		);
		const byRuleCheck = summarizeCheckGroups(
			closed,
			checks.ruleCheck,
			RULE_CHECK_GROUP_TEXT,
			RuleOutcome.NotSet,
		);

		const insightCoverage = {
			tagged: data.tagIds?.length ? null : countTagged(closed, tagsByTrade),
			planChecked: countChecked(
				closed,
				checks.adherence,
				PlanAdherence.Unchecked,
			),
			ruleChecked: countChecked(closed, checks.ruleCheck, RuleOutcome.NotSet),
		};

		return {
			riskMetrics,
			insightCoverage,
			byStrategy,
			bySymbol,
			byTag,
			byAdherence,
			byRuleCheck,
			byDayOfWeek,
			byHour,
		};
	});
