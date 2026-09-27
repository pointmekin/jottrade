import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { isValidTimeZone, toDayKey } from "@/lib/date";
import type { TradeSide, TradeStatus } from "@/lib/trade";

export type CalendarTrade = {
	id: number;
	symbol: string;
	side: TradeSide;
	status: TradeStatus | null;
	netPnl: number | null;
};

export type CalendarDay = {
	/** Closed trades only. */
	netPnl: number;
	/** Closed and open trades. */
	tradeCount: number;
	trades: CalendarTrade[];
};

const tradeColumns = {
	id: trades.id,
	symbol: trades.symbol,
	side: trades.side,
	status: trades.status,
	netPnl: trades.netPnl,
	entryDate: trades.entryDate,
	exitDate: trades.exitDate,
};

const toCalendarTrade = (
	row: Omit<CalendarTrade, "netPnl">,
	netPnl: number | null,
): CalendarTrade => ({
	id: row.id,
	symbol: row.symbol,
	side: row.side,
	status: row.status,
	netPnl,
});

export const getCalendarData = createServerFn({ method: "GET" })
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			year: z.number(),
			month: z.number(),
			from: z.iso.datetime(),
			to: z.iso.datetime(),
			timeZone: z.string().refine(isValidTimeZone, "Invalid IANA timezone"),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const start = new Date(data.from);
		const end = new Date(data.to);
		const inAccount = and(
			eq(trades.userId, userId),
			eq(trades.portfolioId, data.portfolioId),
		);

		const [closedTrades, openTrades] = await Promise.all([
			db
				.select(tradeColumns)
				.from(trades)
				.where(
					and(inAccount, gte(trades.exitDate, start), lt(trades.exitDate, end)),
				),
			db
				.select(tradeColumns)
				.from(trades)
				.where(
					and(
						inAccount,
						gte(trades.entryDate, start),
						lt(trades.entryDate, end),
						isNull(trades.exitDate),
					),
				),
		]);

		const days: Record<string, CalendarDay> = {};
		const addToDay = (at: Date, trade: CalendarTrade) => {
			const key = toDayKey(at, data.timeZone);
			days[key] ??= { netPnl: 0, tradeCount: 0, trades: [] };
			days[key].netPnl += trade.netPnl ?? 0;
			days[key].tradeCount += 1;
			days[key].trades.push(trade);
		};

		for (const row of closedTrades) {
			if (row.exitDate) {
				addToDay(
					row.exitDate,
					toCalendarTrade(row, row.netPnl === null ? null : Number(row.netPnl)),
				);
			}
		}
		for (const row of openTrades) {
			addToDay(row.entryDate, toCalendarTrade(row, null));
		}
		return days;
	});
