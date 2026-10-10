import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { lockPortfolio, requireOwnedPortfolio } from "@/db/portfolios";
import { loadRuleContext } from "@/db/risk-rule-context";
import { trades } from "@/db/schema";
import {
	activeStrategySql,
	assertActiveStrategySql,
	requireOwnedStrategy,
} from "@/db/strategies";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { calculateManualPnl } from "@/lib/pnl-context";
import {
	evaluateEntry,
	hasViolation,
	RULES_UNREADABLE,
	type RuleEntry,
	type StoredRuleCheck,
} from "@/lib/risk-rule-evaluation";
import { TradeConfidence, TradeStatus } from "@/lib/trade";
import { tradeCaptureSchema } from "@/lib/trade-capture";
import { calculateInitialRisk } from "@/lib/trade-risk";
import {
	optionalPositiveDecimal,
	RiskCaptureSource,
} from "@/lib/trade-risk-schema";
import {
	assertExitKept,
	assertInitialPlanPreserved,
	blankDecimalsToNull,
	manualPnlForUpdate,
} from "@/lib/trade-update";
import { authMiddleware } from "./auth-middleware";

const tradeSchema = tradeCaptureSchema.extend({
	portfolioId: z.number().int().positive(),
});
const createTradeSchema = tradeSchema.extend({
	clientDraftId: z.uuid().optional(),
});
const updateTradeSchema = tradeSchema
	.omit({
		initialStopPrice: true,
		entryQuoteToAccountRate: true,
		balanceAccount: true,
		captureSource: true,
		ruleNote: true,
	})
	.partial()
	.extend({
		id: z.number().int().positive(),
		expectedRevision: z.number().int().nonnegative().optional(),
		expectedAnnotationRevision: z.number().int().nonnegative().optional(),
		managementStopPrice: optionalPositiveDecimal.nullable(),
		confidence: z.enum(TradeConfidence).optional(),
		mistake: z.string().optional(),
	})
	.strict();

// A read failure must not fail the save, so the check is Unknown.
async function entryRuleCheck(
	userId: string,
	portfolioId: number,
	entry: RuleEntry,
	capture: Pick<
		z.infer<typeof createTradeSchema>,
		"captureSource" | "ruleNote"
	>,
): Promise<StoredRuleCheck | null> {
	const stored = {
		v: 1 as const,
		evaluatedAt: new Date().toISOString(),
		captureSource: capture.captureSource ?? RiskCaptureSource.Manual,
		acknowledged: false,
		note: null,
		reason: null,
	};
	try {
		const context = await loadRuleContext(userId, portfolioId, entry.entryDate);
		const check = evaluateEntry(context, entry);
		if (check.version === null) return null;
		if (!hasViolation(check)) return { ...stored, ...check };
		const note = capture.ruleNote || null;
		return { ...stored, ...check, acknowledged: true, note };
	} catch (error) {
		console.error("Entry rule check failed", error);
		return {
			...stored,
			version: null,
			timezone: null,
			dayKey: null,
			outcomes: [],
			reason: RULES_UNREADABLE,
		};
	}
}

export const createTrade = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(createTradeSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const portfolio = await requireOwnedPortfolio(userId, data.portfolioId);
		await requireOwnedStrategy(userId, data.setupId);
		const accountCurrency = portfolio.currency ?? DEFAULT_CURRENCY;
		const execution = blankDecimalsToNull({ ...data });
		delete execution.entryQuoteToAccountRate;
		delete execution.balanceAccount;
		delete execution.confirmedUnitQuoteCurrency;
		delete execution.captureSource;
		delete execution.ruleNote;
		const plan = calculateInitialRisk({ ...data, accountCurrency });
		const isClosing = Boolean(data.exitPrice);
		const pnl = data.exitPrice
			? calculateManualPnl({
					...data,
					exitPrice: data.exitPrice,
					accountCurrency,
				})
			: undefined;
		const entryDate = new Date(data.entryDate);
		const exitDate = data.exitDate ? new Date(data.exitDate) : null;
		const ruleCheck = await entryRuleCheck(
			userId,
			portfolio.id,
			{
				entryDate,
				plan,
				exit: pnl
					? { at: exitDate ?? entryDate, netPnl: Number(pnl.netPnl) }
					: null,
			},
			data,
		);
		const insert = db.insert(trades).values({
			...execution,
			userId,
			...plan,
			managementStopPrice: data.initialStopPrice || null,
			entryDate,
			exitDate,
			fees: data.fees || "0",
			netPnl: pnl?.netPnl,
			returnPercent: pnl?.returnPercent,
			pnlCalculationSnapshot: pnl?.pnlCalculationSnapshot,
			exitQuoteToAccountRate: pnl?.exitQuoteToAccountRate ?? null,
			status:
				data.status ?? (isClosing ? TradeStatus.Closed : TradeStatus.Open),
			ruleCheck,
		});
		const { setupId, clientDraftId } = data;
		let created: { id: number } | undefined;
		try {
			const results = await db.batch([
				lockPortfolio(userId, portfolio.id),
				...(setupId
					? [db.execute(assertActiveStrategySql(userId, setupId))]
					: []),
				insert
					.onConflictDoNothing({
						target: [trades.userId, trades.clientDraftId],
						where: sql`${trades.clientDraftId} IS NOT NULL`,
					})
					.returning({ id: trades.id }),
			]);
			[created] = results.at(-1) as { id: number }[];
		} catch (error) {
			await requireOwnedStrategy(userId, setupId);
			throw error;
		}
		if (created)
			return { success: true, id: created.id, duplicate: false, ruleCheck };
		if (!clientDraftId) throw new Error("Trade was not saved.");
		const [existing] = await db
			.select({ id: trades.id, ruleCheck: trades.ruleCheck })
			.from(trades)
			.where(
				and(eq(trades.userId, userId), eq(trades.clientDraftId, clientDraftId)),
			);
		return {
			success: true,
			id: existing.id,
			duplicate: true,
			ruleCheck: existing.ruleCheck,
		};
	});

type ExistingTrade = typeof trades.$inferSelect;
type TradeChanges = Omit<
	z.infer<typeof updateTradeSchema>,
	"id" | "expectedRevision" | "expectedAnnotationRevision"
>;

function validateUpdateRevision(
	existing: ExistingTrade,
	changes: TradeChanges,
	expectedRevision?: number,
	expectedAnnotationRevision?: number,
) {
	if (
		existing.importHash &&
		changes.portfolioId !== undefined &&
		changes.portfolioId !== existing.portfolioId
	)
		throw new Error(
			"Imported trades cannot move accounts. Undo an eligible import and reimport into the intended account.",
		);
	if (
		expectedRevision !== undefined &&
		expectedRevision !== existing.editRevision
	)
		throw new Error("Trade changed. Reload before saving.");
	if (
		changes.notes !== undefined &&
		expectedRevision === undefined &&
		expectedAnnotationRevision === undefined
	)
		throw new Error(
			"Notes require the client annotation baseline. Reload before saving.",
		);
	if (
		changes.notes !== undefined &&
		expectedAnnotationRevision !== undefined &&
		expectedAnnotationRevision !== existing.annotationRevision
	)
		throw new Error("Notes changed. Reload before saving.");
}

export const updateTrade = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(updateTradeSchema)
	.handler(
		async ({
			data: { id, expectedRevision, expectedAnnotationRevision, ...changes },
			context,
		}) => {
			const { userId } = context;
			const [existing] = await db
				.select()
				.from(trades)
				.where(and(eq(trades.id, id), eq(trades.userId, userId)));
			if (!existing) throw new Error("Trade not found");
			validateUpdateRevision(
				existing,
				changes,
				expectedRevision,
				expectedAnnotationRevision,
			);
			assertInitialPlanPreserved(existing, changes);
			assertExitKept(existing, changes);
			const portfolio = await requireOwnedPortfolio(
				userId,
				changes.portfolioId ?? existing.portfolioId,
			);
			const newSetupId =
				changes.setupId !== existing.setupId ? changes.setupId : undefined;
			await requireOwnedStrategy(userId, newSetupId);
			const execution = blankDecimalsToNull({ ...changes });
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
			const update = db
				.update(trades)
				.set({
					...execution,
					...pnl,
					status,
					entryDate: changes.entryDate
						? new Date(changes.entryDate)
						: undefined,
					exitDate: changes.exitDate ? new Date(changes.exitDate) : undefined,
					editRevision: sql`${trades.editRevision} + 1`,
					annotationRevision:
						changes.notes !== undefined
							? sql`${trades.annotationRevision} + 1`
							: undefined,
				})
				.where(
					and(
						eq(trades.id, id),
						eq(trades.userId, userId),
						eq(trades.editRevision, revision),
						changes.notes !== undefined &&
							expectedAnnotationRevision !== undefined
							? eq(trades.annotationRevision, expectedAnnotationRevision)
							: undefined,
						newSetupId ? activeStrategySql(userId, newSetupId) : undefined,
					),
				)
				.returning({ id: trades.id });
			const [, updated] = await db.batch([
				lockPortfolio(userId, portfolio.id),
				update,
			]);
			if (!updated.length)
				throw new Error(
					"Trade changed. Reload and review your changes before retrying.",
				);
			return { success: true };
		},
	);

export const deleteTrade = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.number() }))
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const deleted = await db
			.delete(trades)
			.where(
				and(
					eq(trades.id, data.id),
					eq(trades.userId, userId),
					sql`NOT EXISTS (SELECT 1 FROM review_source_trades WHERE trade_id=${trades.id})`,
				),
			)
			.returning({ id: trades.id });
		if (!deleted.length)
			throw new Error("Trade was removed or belongs to a persisted review.");
		return { success: true };
	});
