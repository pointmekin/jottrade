import { createServerFn } from "@tanstack/react-start";
import { and, eq, exists, gte, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { withRealizations } from "@/db/positions";
import { tradeExecutions, trades } from "@/db/schema";
import {
	scopeDateBound,
	tradeConditions,
	tradeScopeDate,
} from "@/db/trade-filter";
import { analysisScopeSchema } from "@/lib/analysis-scope";
import { groupTradesByDay } from "@/lib/calendar-days";
import { ExecutionKind } from "@/lib/position";
import { authMiddleware } from "./auth-middleware";

const calendarSchema = analysisScopeSchema.extend({
	year: z.number(),
	month: z.number(),
	from: z.iso.datetime(),
	to: z.iso.datetime(),
});

/** The month inside the period. The period end is inclusive; the month end is not. */
function monthInPeriod(data: z.infer<typeof calendarSchema>) {
	const periodFrom = data.dateFrom ? Date.parse(data.dateFrom) : -Infinity;
	const periodTo = data.dateTo ? Date.parse(data.dateTo) + 1 : Infinity;
	return {
		from: new Date(Math.max(Date.parse(data.from), periodFrom)),
		to: new Date(Math.min(Date.parse(data.to), periodTo)),
	};
}

export const getCalendarData = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(calendarSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const range = monthInPeriod(data);
		if (range.from >= range.to) return {};
		const from = scopeDateBound(range.from.toISOString());
		const to = scopeDateBound(range.to.toISOString());
		const exitInRange = db
			.select({ id: tradeExecutions.id })
			.from(tradeExecutions)
			.where(
				and(
					eq(tradeExecutions.tradeId, trades.id),
					eq(tradeExecutions.kind, ExecutionKind.Exit),
					gte(tradeExecutions.executedAt, from),
					lt(tradeExecutions.executedAt, to),
				),
			);
		const rows = await db
			.select({
				id: trades.id,
				symbol: trades.symbol,
				side: trades.side,
				status: trades.status,
				netPnl: trades.netPnl,
				entryDate: trades.entryDate,
				exitDate: trades.exitDate,
				executionCount: trades.executionCount,
			})
			.from(trades)
			.where(
				and(
					tradeConditions(userId, {
						...data,
						dateFrom: undefined,
						dateTo: undefined,
					}),
					or(
						and(gte(tradeScopeDate, from), lt(tradeScopeDate, to)),
						exists(exitInRange),
					),
				),
			);
		const withExits = await withRealizations(
			userId,
			rows.map((row) => ({
				...row,
				netPnl: row.netPnl === null ? null : Number(row.netPnl),
			})),
		);
		return groupTradesByDay(withExits, range, data.timeZone);
	});
