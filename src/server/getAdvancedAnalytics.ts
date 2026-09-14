import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { cashFlows, strategies, trades } from "@/db/schema";
import {
	type ClosedTrade,
	computeAvgHoldTime,
	computeAvgRR,
	computeMaxDrawdown,
	computeSharpe,
	groupByDay,
	summarizeTrades,
	TradeStatus,
} from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { zonedDayOfWeek, zonedHour } from "@/lib/date";
import { rangeSchema, toDateRange } from "./rangeInput";

function aggregateGroup(pnls: number[]) {
	if (!pnls.length) return { count: 0, totalPnl: 0, avgPnl: 0, winRate: 0 };
	const totalPnl = pnls.reduce((a, b) => a + b, 0);
	return {
		count: pnls.length,
		totalPnl,
		avgPnl: totalPnl / pnls.length,
		winRate: (pnls.filter((p) => p > 0).length / pnls.length) * 100,
	};
}

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

		const windowConditions = [
			eq(trades.userId, userId),
			eq(trades.status, TradeStatus.Closed),
			isNotNull(trades.exitDate),
		];
		if (range.from) windowConditions.push(gte(trades.exitDate, range.from));
		if (range.to) windowConditions.push(lte(trades.exitDate, range.to));

		const [allTrades, allStrategies, historyTrades, userCashFlows] =
			await Promise.all([
				db
					.select()
					.from(trades)
					.where(and(...windowConditions))
					.orderBy(asc(trades.exitDate)),
				db.select().from(strategies).where(eq(strategies.userId, userId)),
				db.select().from(trades).where(eq(trades.userId, userId)),
				db.select().from(cashFlows).where(eq(cashFlows.userId, userId)),
			]);

		const analyticsInput: ClosedTrade[] = allTrades.map((t) => ({
			exitDate: new Date(t.exitDate as Date),
			entryDate: new Date(t.entryDate),
			netPnl: Number(t.netPnl ?? 0),
		}));

		const dailyPnl = groupByDay(analyticsInput, input.timeZone);

		// Drawdown reads the account value, so it needs deposits and the carried-in balance.
		const { equityCurve } = summarizeTrades(
			historyTrades.map((t) => ({
				status: t.status,
				entryDate: t.entryDate,
				exitDate: t.exitDate,
				netPnl: Number(t.netPnl ?? 0),
			})),
			userCashFlows.map((flow) => ({
				occurredAt: flow.occurredAt,
				amount: Number(flow.amount),
			})),
			range,
			input.timeZone,
		);

		// Risk metrics
		const riskMetrics = {
			sharpe: computeSharpe(dailyPnl),
			maxDrawdown: computeMaxDrawdown(equityCurve),
			avgRR: computeAvgRR(analyticsInput),
			avgHoldTimeHours: computeAvgHoldTime(analyticsInput),
		};

		// By strategy
		const strategyNameMap = new Map(allStrategies.map((s) => [s.id, s.name]));
		const strategyGroups: Record<string, number[]> = {};
		for (const t of allTrades) {
			const key = t.setupId
				? (strategyNameMap.get(t.setupId) ?? "Unknown")
				: "Unassigned";
			if (!strategyGroups[key]) strategyGroups[key] = [];
			strategyGroups[key].push(Number(t.netPnl ?? 0));
		}
		const byStrategy = Object.entries(strategyGroups).map(([name, pnls]) => ({
			name,
			...aggregateGroup(pnls),
		}));

		// By symbol (top 10)
		const symbolGroups: Record<string, number[]> = {};
		for (const t of allTrades) {
			if (!symbolGroups[t.symbol]) symbolGroups[t.symbol] = [];
			symbolGroups[t.symbol].push(Number(t.netPnl ?? 0));
		}
		const bySymbol = Object.entries(symbolGroups)
			.map(([name, pnls]) => ({ name, ...aggregateGroup(pnls) }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		// Use the same local day as the daily P&L and equity curve.
		const dowGroups: Record<number, number[]> = {
			0: [],
			1: [],
			2: [],
			3: [],
			4: [],
			5: [],
			6: [],
		};
		for (const t of allTrades) {
			const dow = zonedDayOfWeek(new Date(t.exitDate as Date), input.timeZone);
			dowGroups[dow].push(Number(t.netPnl ?? 0));
		}
		const byDayOfWeek = DOW_ORDER.map((d) => ({
			name: DOW_NAMES[d],
			...aggregateGroup(dowGroups[d]),
		}));

		// By entry hour
		const hourGroups: Record<string, number[]> = {};
		for (const t of allTrades) {
			const hour = zonedHour(new Date(t.entryDate), input.timeZone);
			const key = `${String(hour).padStart(2, "0")}:00`;
			if (!hourGroups[key]) hourGroups[key] = [];
			hourGroups[key].push(Number(t.netPnl ?? 0));
		}
		const byHour = Object.entries(hourGroups)
			.sort(([a], [b]) => parseInt(a) - parseInt(b))
			.map(([name, pnls]) => ({ name, ...aggregateGroup(pnls) }));

		return { riskMetrics, byStrategy, bySymbol, byDayOfWeek, byHour };
	},
);
