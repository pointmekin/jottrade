import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isValidTimeZone, toDayKey } from "@/lib/date";

export type CalendarTrade = {
	id: number;
	symbol: string;
	side: string;
	status: string;
	netPnl: number | null;
};

export type CalendarDay = {
	netPnl: number; // sum of closed trade P&L only
	tradeCount: number; // closed + open
	trades: CalendarTrade[];
};

export const getCalendarData = createServerFn({ method: "GET" }).handler(
	async (ctx: any) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");

		const { from, to, timeZone, portfolioId } = z
			.object({
				portfolioId: z.number().int().positive(),
				year: z.number(),
				month: z.number(),
				from: z.string().datetime(),
				to: z.string().datetime(),
				timeZone: z.string().refine(isValidTimeZone, "Invalid IANA timezone"),
			})
			.parse(ctx.data);

		const startDate = new Date(from);
		const endDate = new Date(to);

		// Closed trades: grouped by exitDate
		const closedTrades = await db
			.select({
				id: trades.id,
				symbol: trades.symbol,
				side: trades.side,
				status: trades.status,
				netPnl: trades.netPnl,
				exitDate: trades.exitDate,
			})
			.from(trades)
			.where(
				and(
					eq(trades.userId, session.user.id),
					eq(trades.portfolioId, portfolioId),
					gte(trades.exitDate, startDate),
					lt(trades.exitDate, endDate),
				),
			);

		// Open trades: grouped by entryDate
		const openTrades = await db
			.select({
				id: trades.id,
				symbol: trades.symbol,
				side: trades.side,
				status: trades.status,
				entryDate: trades.entryDate,
			})
			.from(trades)
			.where(
				and(
					eq(trades.userId, session.user.id),
					eq(trades.portfolioId, portfolioId),
					gte(trades.entryDate, startDate),
					lt(trades.entryDate, endDate),
					isNull(trades.exitDate),
				),
			);

		const result: Record<string, CalendarDay> = {};

		const ensureDay = (key: string) => {
			if (!result[key]) result[key] = { netPnl: 0, tradeCount: 0, trades: [] };
		};

		for (const t of closedTrades) {
			if (!t.exitDate) continue;
			const key = toDayKey(new Date(t.exitDate), timeZone);
			ensureDay(key);
			result[key].netPnl += Number(t.netPnl ?? 0);
			result[key].tradeCount += 1;
			result[key].trades.push({
				id: t.id,
				symbol: t.symbol,
				side: t.side!,
				status: t.status!,
				netPnl: t.netPnl !== null ? Number(t.netPnl) : null,
			});
		}

		for (const t of openTrades) {
			if (!t.entryDate) continue;
			const key = toDayKey(new Date(t.entryDate), timeZone);
			ensureDay(key);
			result[key].tradeCount += 1;
			result[key].trades.push({
				id: t.id,
				symbol: t.symbol,
				side: t.side!,
				status: t.status!,
				netPnl: null,
			});
		}

		return result as Record<string, CalendarDay>;
	},
);
