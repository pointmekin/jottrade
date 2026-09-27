import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { loadAccountHistory } from "@/db/account-history";
import { strategies } from "@/db/schema";
import {
	closedTradesInRange,
	realizedAt,
	summarizeTrades,
} from "@/lib/analytics";
import { requireUserId } from "@/lib/auth";
import { toDayKey, zonedDayOfWeek, zonedHour } from "@/lib/date";
import { summarizeGroup, summarizeGroups } from "@/lib/group-summary";
import {
	computeAvgHoldTime,
	computeMaxDrawdown,
	computePayoffRatio,
	computeSharpe,
} from "@/lib/risk-metrics";
import { rangeSchema, toDateRange } from "./rangeInput";

const DAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
const TOP_SYMBOLS = 10;

export const getAdvancedAnalytics = createServerFn({ method: "GET" })
	.validator(rangeSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const range = toDateRange(data);
		const [history, userStrategies] = await Promise.all([
			loadAccountHistory(userId, data.portfolioId),
			db.select().from(strategies).where(eq(strategies.userId, userId)),
		]);

		const closed = closedTradesInRange(history.trades, range);
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
				key: String(setupId),
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
			.slice(0, TOP_SYMBOLS);

		const dayGroups = summarizeGroups(
			closed,
			(trade) => zonedDayOfWeek(realizedAt(trade), data.timeZone),
			pnlOf,
		);
		const byDayOfWeek = MONDAY_FIRST.map((day) => ({
			key: DAY_NAMES[day],
			name: DAY_NAMES[day],
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
			.map(([hour, summary]) => {
				const name = `${String(hour).padStart(2, "0")}:00`;
				return { key: name, name, ...summary };
			});

		return { riskMetrics, byStrategy, bySymbol, byDayOfWeek, byHour };
	});
