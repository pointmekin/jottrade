import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { cashFlows } from "@/db/schema";
import { AccountEntryKind, type AccountEntryRecord } from "@/lib/account-entry";
import { requireUserId } from "@/lib/auth";

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
	.validator(
		accountEntrySchema.extend({
			id: z.number().int().positive(),
			expectedRevision: z.number().int().nonnegative().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const occurredAt = new Date(data.occurredAt);

		if (Number.isNaN(occurredAt.getTime())) {
			throw new Error("Invalid date.");
		}

		const [existing] = await db
			.select()
			.from(cashFlows)
			.where(and(eq(cashFlows.id, data.id), eq(cashFlows.userId, userId)));
		if (
			!existing ||
			(data.expectedRevision !== undefined &&
				data.expectedRevision !== existing.editRevision)
		)
			throw new Error(
				"Account entry changed or was removed. Reload before saving.",
			);
		const updated = await db
			.update(cashFlows)
			.set({
				occurredAt,
				amount: data.amount.toFixed(2),
				kind: data.kind,
				note: data.note || null,
				editRevision: sql`${cashFlows.editRevision} + 1`,
			})
			.where(
				and(
					eq(cashFlows.id, data.id),
					eq(cashFlows.userId, userId),
					eq(cashFlows.editRevision, existing.editRevision),
				),
			)
			.returning({ id: cashFlows.id });

		if (!updated.length) throw new Error("Account entry not found.");
		return { id: data.id };
	});

export const deleteCashFlow = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId();

		const deleted = await db
			.delete(cashFlows)
			.where(
				and(
					eq(cashFlows.id, data.id),
					eq(cashFlows.userId, userId),
					sql`NOT EXISTS (SELECT 1 FROM review_source_cash_flows WHERE cash_flow_id=${cashFlows.id})`,
				),
			)
			.returning({ id: cashFlows.id });

		if (!deleted.length) throw new Error("Cash flow not found.");
		return { id: data.id };
	});
