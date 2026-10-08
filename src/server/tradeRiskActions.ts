import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { trades } from "@/db/schema";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { shouldRecalculatePnl } from "@/lib/finance";
import { tradeCaptureSchema } from "@/lib/trade-capture";
import { calculateInitialRisk } from "@/lib/trade-risk";
import {
	RiskCaptureSource,
	type RiskCorrection,
	type RiskPlan,
} from "@/lib/trade-risk-schema";
import { manualPnlFieldsForUpdate } from "@/lib/trade-update";
import { authMiddleware } from "./auth-middleware";

const correctionSchema = tradeCaptureSchema
	.omit({
		notes: true,
		status: true,
		exitPrice: true,
		exitDate: true,
		exitQuoteToAccountRate: true,
		fees: true,
	})
	.extend({
		id: z.number().int().positive(),
		expectedRevision: z.number().int().nonnegative(),
		reason: z.string().trim().min(1).max(500),
		correctExecutionInputs: z.boolean().default(false),
	})
	.strict();

export const correctTradeInitialRisk = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(correctionSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const [existing] = await db
			.select()
			.from(trades)
			.where(and(eq(trades.id, data.id), eq(trades.userId, userId)));
		if (!existing) throw new Error("Trade not found");
		if (
			data.correctExecutionInputs &&
			!shouldRecalculatePnl(existing.importHash)
		)
			throw new Error(
				"Imported execution corrections must use import reconciliation. Correct the original risk plan separately.",
			);
		if (existing.editRevision !== data.expectedRevision)
			throw new Error(
				"Trade changed. Reload before correcting the original plan.",
			);
		const portfolio = await requireOwnedPortfolio(userId, existing.portfolioId);
		const accountCurrency = portfolio.currency ?? DEFAULT_CURRENCY;
		const replacement = calculateInitialRisk({
			...data,
			accountCurrency,
			captureSource:
				existing.initialRiskSnapshot?.captureSource ??
				RiskCaptureSource.LegacyAttested,
		});
		const previous: RiskPlan = {
			initialStopPrice: existing.initialStopPrice,
			initialTargetPrice: existing.initialTargetPrice,
			initialRiskAmount: existing.initialRiskAmount,
			initialRiskPercent: existing.initialRiskPercent,
			initialRiskSnapshot: existing.initialRiskSnapshot,
		};
		const history: RiskCorrection = {
			correctedAt: new Date().toISOString(),
			reason: data.reason,
			revisionBefore: data.expectedRevision,
			revisionAfter: data.expectedRevision + 1,
			previous,
			replacement,
		};
		const execution = data.correctExecutionInputs
			? {
					symbol: data.symbol,
					side: data.side,
					entryDate: new Date(data.entryDate),
					entryPrice: data.entryPrice,
					quantity: data.quantity,
				}
			: {};
		const pnl = data.correctExecutionInputs
			? manualPnlFieldsForUpdate(existing, data, accountCurrency)
			: {};
		const updated = await db
			.update(trades)
			.set({
				...execution,
				...pnl,
				...replacement,
				riskCorrectionHistory: sql`coalesce(${trades.riskCorrectionHistory}, '[]'::jsonb) || ${JSON.stringify([history])}::jsonb`,
				editRevision: sql`${trades.editRevision} + 1`,
			})
			.where(
				and(
					eq(trades.id, data.id),
					eq(trades.userId, userId),
					eq(trades.portfolioId, existing.portfolioId),
					eq(trades.editRevision, data.expectedRevision),
				),
			)
			.returning({ id: trades.id });
		if (!updated.length)
			throw new Error(
				"Trade changed. Reload before correcting the original plan.",
			);
		return { success: true };
	});
