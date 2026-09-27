import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { groupTradesByDay } from "@/lib/calendar-days";
import { isValidTimeZone } from "@/lib/date";

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
					eq(trades.userId, userId),
					eq(trades.portfolioId, data.portfolioId),
					or(
						and(
							gte(trades.exitDate, range.from),
							lt(trades.exitDate, range.to),
						),
						and(
							gte(trades.entryDate, range.from),
							lt(trades.entryDate, range.to),
						),
					),
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
