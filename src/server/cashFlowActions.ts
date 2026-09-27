import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { cashFlows } from "@/db/schema";
import { AccountEntryKind, type AccountEntryRecord } from "@/lib/account-entry";
import { requireUserId } from "@/lib/auth";
import { sha256Hex } from "@/lib/hash";

export type CashFlowRecord = AccountEntryRecord;

const cashFlowScopeSchema = z.object({
	portfolioId: z.number().int().positive(),
});

export const getCashFlows = createServerFn({ method: "GET" })
	.validator(cashFlowScopeSchema)
	.handler(async ({ data }): Promise<CashFlowRecord[]> => {
		const userId = await requireUserId();

		const rows = await db
			.select()
			.from(cashFlows)
			.where(
				and(
					eq(cashFlows.userId, userId),
					eq(cashFlows.portfolioId, data.portfolioId),
				),
			)
			.orderBy(desc(cashFlows.occurredAt), desc(cashFlows.id));

		return rows.map((row) => ({
			id: row.id,
			occurredAt: row.occurredAt.toISOString(),
			amount: Number(row.amount),
			kind: row.kind,
			note: row.note,
		}));
	});

const accountEntryKindSchema = z.enum(AccountEntryKind);

const accountEntrySchema = z.object({
	occurredAt: z.string().min(1),
	amount: z
		.number()
		.finite()
		.refine((value) => value !== 0, {
			message: "Amount must not be zero.",
		}),
	kind: accountEntryKindSchema,
	note: z.string().trim().max(280).optional(),
});

export const addCashFlow = createServerFn({ method: "POST" })
	.validator(
		accountEntrySchema.extend({ portfolioId: z.number().int().positive() }),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedPortfolio(userId, data.portfolioId);

		const occurredAt = new Date(
			data.occurredAt.length === 10
				? `${data.occurredAt}T00:00:00Z`
				: data.occurredAt,
		);

		if (Number.isNaN(occurredAt.getTime())) {
			throw new Error("Invalid date.");
		}

		const [created] = await db
			.insert(cashFlows)
			.values({
				userId,
				portfolioId: data.portfolioId,
				occurredAt,
				amount: data.amount.toFixed(2),
				kind: data.kind,
				note: data.note || null,
			})
			.returning();

		return { id: created.id };
	});

export const updateCashFlow = createServerFn({ method: "POST" })
	.validator(accountEntrySchema.extend({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const occurredAt = new Date(data.occurredAt);

		if (Number.isNaN(occurredAt.getTime())) {
			throw new Error("Invalid date.");
		}

		const updated = await db
			.update(cashFlows)
			.set({
				occurredAt,
				amount: data.amount.toFixed(2),
				kind: data.kind,
				note: data.note || null,
			})
			.where(and(eq(cashFlows.id, data.id), eq(cashFlows.userId, userId)))
			.returning({ id: cashFlows.id });

		if (!updated.length) throw new Error("Account entry not found.");
		return { id: data.id };
	});

const importedAdjustmentSchema = z.object({
	symbol: z.string().max(40),
	type: z.string().max(40),
	lots: z.string().max(40),
	positionId: z.string().max(80),
	exDate: z.string().max(80),
	adjustmentDay: z.string().max(80),
	occurredAt: z.string().min(1).max(80),
	dividendRate: z.string().max(80),
	amount: z
		.number()
		.finite()
		.refine((value) => value !== 0),
	note: z.string().trim().min(1).max(280),
});

type ImportedAdjustment = z.infer<typeof importedAdjustmentSchema>;

const adjustmentHash = (userId: string, adjustment: ImportedAdjustment) =>
	sha256Hex(
		[
			userId,
			adjustment.symbol,
			adjustment.type,
			adjustment.lots,
			adjustment.positionId,
			adjustment.exDate,
			adjustment.occurredAt,
			adjustment.dividendRate,
			adjustment.amount.toFixed(2),
		].join("|"),
	);

export const importAdjustments = createServerFn({ method: "POST" })
	.validator(
		z.object({
			portfolioId: z.number().int().positive(),
			adjustments: z.array(importedAdjustmentSchema).min(1).max(5000),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedPortfolio(userId, data.portfolioId);
		const dated = data.adjustments.filter(
			(adjustment) => !Number.isNaN(new Date(adjustment.occurredAt).getTime()),
		);
		const values = await Promise.all(
			dated.map(async (adjustment) => ({
				userId,
				portfolioId: data.portfolioId,
				occurredAt: new Date(adjustment.occurredAt),
				amount: adjustment.amount.toFixed(2),
				kind: AccountEntryKind.Adjustment,
				note: adjustment.note,
				importHash: await adjustmentHash(userId, adjustment),
			})),
		);

		const inserted = await db
			.insert(cashFlows)
			.values(values)
			.onConflictDoNothing({ target: cashFlows.importHash })
			.returning({ id: cashFlows.id });

		return {
			count: inserted.length,
			skipped: values.length - inserted.length,
		};
	});

export const deleteCashFlow = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId();

		const deleted = await db
			.delete(cashFlows)
			.where(and(eq(cashFlows.id, data.id), eq(cashFlows.userId, userId)))
			.returning({ id: cashFlows.id });

		if (!deleted.length) throw new Error("Cash flow not found.");
		return { id: data.id };
	});
