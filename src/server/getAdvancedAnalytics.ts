import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cashFlows, strategies, trades } from "@/db/schema";
import {
	type ClosedTrade,
	closedTradesInRange,
	computeAvgHoldTime,
	computeMaxDrawdown,
	computePayoffRatio,
	computeSharpe,
	summarizeGroup,
	summarizeGroups,
	summarizeTrades,
} from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { toDayKey, zonedDayOfWeek, zonedHour } from "@/lib/date";
import { rangeSchema, toDateRange } from "./rangeInput";

const DOW_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const getAdvancedAnalytics = createServerFn({ method: "GET" }).handler(
	async (ctx: any) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");

		const userId = session.user.id;
		const input = rangeSchema.parse(ctx.data ?? {});
		const range = toDateRange(input);

		const [historyTrades, allStrategies, userCashFlows] = await Promise.all([
			db
				.select()
				.from(trades)
				.where(
					and(
						eq(trades.userId, userId),
						eq(trades.portfolioId, input.portfolioId),
					),
				),
			db.select().from(strategies).where(eq(strategies.userId, userId)),
			db
				.select()
				.from(cashFlows)
				.where(
					and(
						eq(cashFlows.userId, userId),
						eq(cashFlows.portfolioId, input.portfolioId),
					),
				),
		]);

		const records = historyTrades.map((t) => ({
			...t,
			netPnl: Number(t.netPnl ?? 0),
		}));
		// The same trade set as the headline: a closed trade without an exit date
		// is realized at entry.
		const allTrades = closedTradesInRange(records, range);
		const pnlOf = (t: (typeof allTrades)[number]) => t.netPnl;

		const analyticsInput: ClosedTrade[] = allTrades.map((t) => ({
			exitDate: t.exitDate ?? t.entryDate,
			entryDate: t.entryDate,
			netPnl: t.netPnl,
		}));

		const { equityCurve } = summarizeTrades(
			records,
			userCashFlows.map((flow) => ({
				occurredAt: flow.occurredAt,
				amount: Number(flow.amount),
				kind: flow.kind,
			})),
			range,
			input.timeZone,
		);

		const now = new Date();
		const windowEnd = range.to && range.to < now ? range.to : now;

		const riskMetrics = {
			closedTrades: allTrades.length,
			sharpe: computeSharpe(equityCurve, toDayKey(windowEnd, input.timeZone)),
			maxDrawdown: computeMaxDrawdown(equityCurve),
			payoff: computePayoffRatio(analyticsInput),
			avgHoldTimeHours: computeAvgHoldTime(analyticsInput),
		};

		// Keyed by id, so two strategies with one name stay separate.
		const strategyNameMap = new Map(allStrategies.map((s) => [s.id, s.name]));
		const byStrategy = Array.from(
			summarizeGroups(allTrades, (t) => t.setupId, pnlOf),
			([setupId, summary]) => ({
				name:
					setupId === null
						? "Unassigned"
						: (strategyNameMap.get(setupId) ?? "Unknown"),
				...summary,
			}),
		);

		const bySymbol = Array.from(
			summarizeGroups(allTrades, (t) => t.symbol, pnlOf),
			([name, summary]) => ({ name, ...summary }),
		)
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		// Use the same local day as the daily P&L and equity curve.
		const dowGroups = summarizeGroups(
			allTrades,
			(t) => zonedDayOfWeek(t.exitDate ?? t.entryDate, input.timeZone),
			pnlOf,
		);
		const byDayOfWeek = DOW_ORDER.map((d) => ({
			name: DOW_NAMES[d],
			...(dowGroups.get(d) ?? summarizeGroup([])),
		}));

		const byHour = Array.from(
			summarizeGroups(
				allTrades,
				(t) => zonedHour(t.entryDate, input.timeZone),
				pnlOf,
			),
		)
			.sort(([a], [b]) => a - b)
			.map(([hour, summary]) => ({
				name: `${String(hour).padStart(2, "0")}:00`,
				...summary,
			}));

		return { riskMetrics, byStrategy, bySymbol, byDayOfWeek, byHour };
	},
);
