import { createServerFn } from "@tanstack/react-start";
import { and, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { trades } from "@/db/schema";
import {
	scopeDateBound,
	tradeConditions,
	tradeScopeDate,
} from "@/db/trade-filter";
import { analysisScopeSchema } from "@/lib/analysis-scope";
import { groupTradesByDay } from "@/lib/calendar-days";
import { authMiddleware } from "./auth-middleware";

export const getCalendarData = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(
		analysisScopeSchema.extend({
			year: z.number(),
			month: z.number(),
			from: z.iso.datetime(),
			to: z.iso.datetime(),
		}),
	)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const range = { from: new Date(data.from), to: new Date(data.to) };
		const rows = await db
			.select({
				id: trades.id,
				symbol: trades.symbol,
				side: trades.side,
				status: trades.status,
				netPnl: trades.netPnl,
				entryDate: trades.entryDate,
				exitDate: trades.exitDate,
			})
			.from(trades)
			.where(
				and(
					tradeConditions(userId, data),
					gte(tradeScopeDate, scopeDateBound(data.from)),
					lt(tradeScopeDate, scopeDateBound(data.to)),
				),
			);
		return groupTradesByDay(
			rows.map((row) => ({
				...row,
				netPnl: row.netPnl === null ? null : Number(row.netPnl),
			})),
			range,
			data.timeZone,
		);
	});
