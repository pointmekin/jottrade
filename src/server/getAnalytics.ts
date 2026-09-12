import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cashFlows, trades } from "@/db/schema";
import { summarizeTrades } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { rangeSchema, toDateRange } from "./rangeInput";

export const getAnalytics = createServerFn({ method: "GET" }).handler(
	async (ctx: any) => {
		const session = await auth.api.getSession({
			headers: getRequestHeaders(),
		});

		if (!session) {
			throw new Error("Unauthorized");
		}

		const userId = session.user.id;
		const range = toDateRange(rangeSchema.parse(ctx.data ?? {}));

		// The whole history is loaded because the window needs the balance carried into it.
		const [userTrades, userCashFlows] = await Promise.all([
			db.select().from(trades).where(eq(trades.userId, userId)),
			db.select().from(cashFlows).where(eq(cashFlows.userId, userId)),
		]);

		return summarizeTrades(
			userTrades.map((trade) => ({
				status: trade.status,
				entryDate: trade.entryDate,
				exitDate: trade.exitDate,
				netPnl: Number(trade.netPnl ?? 0),
			})),
			userCashFlows.map((flow) => ({
				occurredAt: flow.occurredAt,
				amount: Number(flow.amount),
			})),
			range,
		);
	},
);
