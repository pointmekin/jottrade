import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { trades } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { calculateManualPnl } from "@/lib/pnl-context";
import { TradeConfidence, TradeStatus } from "@/lib/trade";
import { tradeCaptureSchema } from "@/lib/trade-capture";
import { calculateInitialRisk } from "@/lib/trade-risk";
import { optionalPositiveDecimal } from "@/lib/trade-risk-schema";
import {
	assertInitialPlanPreserved,
	manualPnlForUpdate,
} from "@/lib/trade-update";

const tradeSchema = tradeCaptureSchema.extend({
	portfolioId: z.number().int().positive(),
});
const updateTradeSchema = tradeSchema
	.omit({
		initialStopPrice: true,
		entryQuoteToAccountRate: true,
		balanceAccount: true,
		captureSource: true,
	})
	.partial()
	.extend({
		id: z.number().int().positive(),
		expectedRevision: z.number().int().nonnegative().optional(),
		managementStopPrice: optionalPositiveDecimal.nullable(),
		confidence: z.enum(TradeConfidence).optional(),
		mistake: z.string().optional(),
		setupId: z.number().nullable().optional(),
	})
	.strict();

export const createTrade = createServerFn({ method: "POST" })
	.validator(tradeSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const portfolio = await requireOwnedPortfolio(userId, data.portfolioId);
		const accountCurrency = portfolio.currency ?? DEFAULT_CURRENCY;
		const execution = { ...data };
		delete execution.entryQuoteToAccountRate;
		delete execution.balanceAccount;
		delete execution.confirmedUnitQuoteCurrency;
		delete execution.captureSource;
		const plan = calculateInitialRisk({ ...data, accountCurrency });
		const isClosing = Boolean(data.exitPrice);
		const pnl = data.exitPrice
			? calculateManualPnl({
					...data,
					exitPrice: data.exitPrice,
					accountCurrency,
				})
			: undefined;
		await db.insert(trades).values({
			...execution,
			userId,
			...plan,
			managementStopPrice: data.initialStopPrice || null,
			entryDate: new Date(data.entryDate),
			exitDate: data.exitDate ? new Date(data.exitDate) : null,
			targetPrice: data.targetPrice || null,
			exitPrice: data.exitPrice || null,
			fees: data.fees || "0",
			netPnl: pnl?.netPnl,
			returnPercent: pnl?.returnPercent,
			pnlCalculationSnapshot: pnl?.pnlCalculationSnapshot,
			exitQuoteToAccountRate: pnl?.exitQuoteToAccountRate ?? null,
			status:
				data.status ?? (isClosing ? TradeStatus.Closed : TradeStatus.Open),
		});
		return { success: true };
	});

export const updateTrade = createServerFn({ method: "POST" })
	.validator(updateTradeSchema)
	.handler(async ({ data: { id, expectedRevision, ...changes } }) => {
		const userId = await requireUserId();
		const [existing] = await db
			.select()
			.from(trades)
			.where(and(eq(trades.id, id), eq(trades.userId, userId)));
		if (!existing) throw new Error("Trade not found");
		assertInitialPlanPreserved(existing, changes);
		const portfolio = await requireOwnedPortfolio(
			userId,
			changes.portfolioId ?? existing.portfolioId,
		);
		const execution = { ...changes };
		delete execution.confirmedUnitQuoteCurrency;
		const { isRecalculated, ...pnl } = manualPnlForUpdate(
			existing,
			changes,
			portfolio.currency ?? DEFAULT_CURRENCY,
		);
		const closesNow = isRecalculated && changes.exitPrice && !changes.status;
		const status = closesNow
			? TradeStatus.Closed
			: (changes.status ?? existing.status);
		const revision = expectedRevision ?? existing.editRevision;
		const updated = await db
			.update(trades)
			.set({
				...execution,
				...pnl,
				status,
				entryDate: changes.entryDate ? new Date(changes.entryDate) : undefined,
				exitDate: changes.exitDate ? new Date(changes.exitDate) : undefined,
				targetPrice: changes.targetPrice === "" ? null : changes.targetPrice,
				managementStopPrice:
					changes.managementStopPrice === ""
						? null
						: changes.managementStopPrice,
				editRevision: sql`${trades.editRevision} + 1`,
			})
			.where(
				and(
					eq(trades.id, id),
					eq(trades.userId, userId),
					eq(trades.editRevision, revision),
				),
			)
			.returning({ id: trades.id });
		if (!updated.length)
			throw new Error(
				"Trade changed. Reload and review your changes before retrying.",
			);
		return { success: true };
	});

export const deleteTrade = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await db
			.delete(trades)
			.where(and(eq(trades.id, data.id), eq(trades.userId, userId)));
		return { success: true };
	});
