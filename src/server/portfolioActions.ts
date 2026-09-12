import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cashFlows, portfolios } from "@/db/schema";
import { auth } from "@/lib/auth";
import { DEFAULT_CURRENCY } from "@/lib/currency";

async function requireUserId(): Promise<string> {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session) throw new Error("Unauthorized");
	return session.user.id;
}

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

	const [created] = await db
		.insert(portfolios)
		.values({
			userId,
			name: "Main account",
			currency: DEFAULT_CURRENCY,
			isDefault: true,
		})
		.returning();

	return created;
}

export const getPortfolio = createServerFn({ method: "GET" }).handler(
	async () => {
		const userId = await requireUserId();
		const portfolio = await resolveDefaultPortfolio(userId);
		return {
			id: portfolio.id,
			name: portfolio.name,
			currency: portfolio.currency ?? DEFAULT_CURRENCY,
		};
	},
);

const updatePortfolioSchema = z.object({
	name: z.string().trim().min(1).max(64).optional(),
	currency: z.string().trim().length(3).toUpperCase().optional(),
});

export const updatePortfolio = createServerFn({ method: "POST" }).handler(
	async (ctx: any) => {
		const userId = await requireUserId();
		const patch = updatePortfolioSchema.parse(ctx.data);
		const portfolio = await resolveDefaultPortfolio(userId);

		const [updated] = await db
			.update(portfolios)
			.set(patch)
			.where(
				and(eq(portfolios.id, portfolio.id), eq(portfolios.userId, userId)),
			)
			.returning();

		return {
			id: updated.id,
			name: updated.name,
			currency: updated.currency ?? DEFAULT_CURRENCY,
		};
	},
);

export type CashFlowRecord = {
	id: number;
	occurredAt: string;
	amount: number;
	note: string | null;
};

export const getCashFlows = createServerFn({ method: "GET" }).handler(
	async (): Promise<CashFlowRecord[]> => {
		const userId = await requireUserId();

		const rows = await db
			.select()
			.from(cashFlows)
			.where(eq(cashFlows.userId, userId))
			.orderBy(desc(cashFlows.occurredAt), desc(cashFlows.id));

		return rows.map((row) => ({
			id: row.id,
			occurredAt: row.occurredAt.toISOString(),
			amount: Number(row.amount),
			note: row.note,
		}));
	},
);

const addCashFlowSchema = z.object({
	// A day string keeps the ledger aligned with the UTC day used by the equity curve.
	occurredAt: z.string().min(1),
	amount: z.number().refine((value) => value !== 0, {
		message: "Amount must not be zero.",
	}),
	note: z.string().trim().max(140).optional(),
});

export const addCashFlow = createServerFn({ method: "POST" }).handler(
	async (ctx: any) => {
		const userId = await requireUserId();
		const input = addCashFlowSchema.parse(ctx.data);
		const portfolio = await resolveDefaultPortfolio(userId);

		const occurredAt = new Date(
			input.occurredAt.length === 10
				? `${input.occurredAt}T00:00:00Z`
				: input.occurredAt,
		);

		if (Number.isNaN(occurredAt.getTime())) {
			throw new Error("Invalid date.");
		}

		const [created] = await db
			.insert(cashFlows)
			.values({
				userId,
				portfolioId: portfolio.id,
				occurredAt,
				amount: input.amount.toFixed(2),
				note: input.note || null,
			})
			.returning();

		return { id: created.id };
	},
);

export const deleteCashFlow = createServerFn({ method: "POST" }).handler(
	async (ctx: any) => {
		const userId = await requireUserId();
		const { id } = z.object({ id: z.number() }).parse(ctx.data);

		const deleted = await db
			.delete(cashFlows)
			.where(and(eq(cashFlows.id, id), eq(cashFlows.userId, userId)))
			.returning({ id: cashFlows.id });

		if (!deleted.length) throw new Error("Cash flow not found.");
		return { id };
	},
);
