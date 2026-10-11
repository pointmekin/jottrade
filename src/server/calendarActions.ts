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
		const from = scopeDateBound(data.from);
		const to = scopeDateBound(data.to);
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
					tradeConditions(userId, data),
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
