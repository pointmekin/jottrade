import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cashFlows, portfolios, trades } from "@/db/schema";
import { AccountKind } from "@/lib/account";
import { AccountEntryKind, type AccountEntryRecord } from "@/lib/account-entry";
import { auth } from "@/lib/auth";
import { DEFAULT_CURRENCY } from "@/lib/currency";

async function requireUserId(): Promise<string> {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session) throw new Error("Unauthorized");
	return session.user.id;
}

export type AccountRecord = {
	id: number;
	name: string;
	description: string | null;
	kind: AccountKind;
	currency: string;
	isDefault: boolean;
	tradeCount: number;
};

/**
 * The default portfolio for a user, created on first read.
 * Every screen reads its currency, so it must always exist.
 *
 * Keep this unexported. `useCurrency` pulls this module into the client graph,
 * and an exported function that touches `db` keeps the Neon driver in the
 * client bundle, where it throws for a missing connection string.
 */
async function resolveDefaultPortfolio(userId: string) {
	const [existing] = await db
		.select()
		.from(portfolios)
		.where(eq(portfolios.userId, userId))
		.orderBy(desc(portfolios.isDefault), asc(portfolios.id))
		.limit(1);

	if (existing) return existing;

	// A parallel read can provision the same default first; the partial unique
	// index on (user_id) WHERE is_default turns the loser into a no-op.
	const [created] = await db
		.insert(portfolios)
		.values({
			userId,
			name: "Main account",
			currency: DEFAULT_CURRENCY,
			isDefault: true,
		})
		.onConflictDoNothing()
		.returning();

	if (created) return created;

	const [winner] = await db
		.select()
		.from(portfolios)
		.where(eq(portfolios.userId, userId))
		.orderBy(asc(portfolios.id))
		.limit(1);

	return winner;
}

async function requireOwnedPortfolio(userId: string, portfolioId: number) {
	const [portfolio] = await db
		.select({ id: portfolios.id })
		.from(portfolios)
		.where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)));
	if (!portfolio) throw new Error("Account not found.");
	return portfolio;
}

type AccountFields = Pick<
	typeof portfolios.$inferSelect,
	"id" | "name" | "description" | "kind" | "currency" | "isDefault"
>;

function toAccountRecord(row: AccountFields, tradeCount = 0): AccountRecord {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		kind: row.kind === AccountKind.Demo ? AccountKind.Demo : AccountKind.Real,
		currency: row.currency ?? DEFAULT_CURRENCY,
		isDefault: row.isDefault ?? false,
		tradeCount,
	};
}

export const getAccounts = createServerFn({ method: "GET" }).handler(
	async (): Promise<AccountRecord[]> => {
		const userId = await requireUserId();

		const rows = await db
			.select({
				id: portfolios.id,
				name: portfolios.name,
				description: portfolios.description,
				kind: portfolios.kind,
				currency: portfolios.currency,
				isDefault: portfolios.isDefault,
				tradeCount: count(trades.id),
			})
			.from(portfolios)
			.leftJoin(trades, eq(trades.portfolioId, portfolios.id))
			.where(eq(portfolios.userId, userId))
			.groupBy(portfolios.id)
			.orderBy(desc(portfolios.isDefault), asc(portfolios.id));

		if (rows.length === 0) {
			const created = await resolveDefaultPortfolio(userId);
			return [toAccountRecord(created)];
		}

		if (!rows.some((row) => row.isDefault)) {
			// Self-heal the single-default invariant after out-of-band data changes.
			const oldest = rows[0];
			await db
				.update(portfolios)
				.set({ isDefault: true })
				.where(eq(portfolios.id, oldest.id));
			return rows.map((row) =>
				toAccountRecord(
					{ ...row, isDefault: row.id === oldest.id },
					row.tradeCount,
				),
			);
		}

		return rows.map((row) => toAccountRecord(row, row.tradeCount));
	},
);

const accountDetailsSchema = z.object({
	name: z.string().trim().min(1).max(64),
	description: z.string().trim().max(500),
	kind: z.enum([AccountKind.Real, AccountKind.Demo]),
	currency: z.string().trim().length(3).toUpperCase(),
});

export const createAccount = createServerFn({ method: "POST" })
	.validator(accountDetailsSchema)
	.handler(async ({ data }): Promise<AccountRecord> => {
		const userId = await requireUserId();

		const [created] = await db
			.insert(portfolios)
			.values({
				userId,
				name: data.name,
				description: data.description || null,
				kind: data.kind,
				currency: data.currency,
				isDefault: false,
			})
			.returning();

		return toAccountRecord(created);
	});

const updateAccountSchema = accountDetailsSchema
	.partial()
	.extend({ id: z.number().int().positive() });

export const updateAccount = createServerFn({ method: "POST" })
	.validator(updateAccountSchema)
	.handler(async ({ data }): Promise<AccountRecord> => {
		const userId = await requireUserId();

		const patch: Partial<typeof portfolios.$inferInsert> = {};
		if (data.name !== undefined) patch.name = data.name;
		if (data.description !== undefined)
			patch.description = data.description || null;
		if (data.kind !== undefined) patch.kind = data.kind;
		if (data.currency !== undefined) patch.currency = data.currency;

		const [updated] = await db
			.update(portfolios)
			.set(patch)
			.where(and(eq(portfolios.id, data.id), eq(portfolios.userId, userId)))
			.returning();

		if (!updated) throw new Error("Account not found.");

		return toAccountRecord(updated);
	});

const deleteAccountSchema = z.object({
	id: z.number().int().positive(),
	confirmName: z.string().min(1),
});

export const deleteAccount = createServerFn({ method: "POST" })
	.validator(deleteAccountSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();

		const [account] = await db
			.select()
			.from(portfolios)
			.where(and(eq(portfolios.id, data.id), eq(portfolios.userId, userId)));

		if (!account) throw new Error("Account not found.");
		if (account.name !== data.confirmName) {
			throw new Error("Account name does not match.");
		}

		await db
			.delete(portfolios)
			.where(and(eq(portfolios.id, data.id), eq(portfolios.userId, userId)));

		// Keep exactly one default whenever one still exists. neon-http has no
		// transaction support, so promote after the delete; a failure here leaves
		// no default, which the getAccounts read path self-heals.
		if (account.isDefault) {
			const [next] = await db
				.select({ id: portfolios.id })
				.from(portfolios)
				.where(eq(portfolios.userId, userId))
				.orderBy(asc(portfolios.id))
				.limit(1);
			if (next) {
				await db
					.update(portfolios)
					.set({ isDefault: true })
					.where(eq(portfolios.id, next.id));
			}
		}

		return { success: true };
	});

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
			kind: row.kind as AccountEntryRecord["kind"],
			note: row.note,
		}));
	});

const accountEntryKindSchema = z.enum([
	AccountEntryKind.Deposit,
	AccountEntryKind.Withdrawal,
	AccountEntryKind.Adjustment,
]);

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

async function buildAdjustmentHash(parts: string[]) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(parts.join("|")),
	);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

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
		const values: (typeof cashFlows.$inferInsert)[] = [];

		for (const adjustment of data.adjustments) {
			const occurredAt = new Date(adjustment.occurredAt);
			if (Number.isNaN(occurredAt.getTime())) continue;

			values.push({
				userId,
				portfolioId: data.portfolioId,
				occurredAt,
				amount: adjustment.amount.toFixed(2),
				kind: AccountEntryKind.Adjustment,
				note: adjustment.note,
				importHash: await buildAdjustmentHash([
					userId,
					adjustment.symbol,
					adjustment.type,
					adjustment.lots,
					adjustment.positionId,
					adjustment.exDate,
					adjustment.occurredAt,
					adjustment.dividendRate,
					adjustment.amount.toFixed(2),
				]),
			});
		}

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
