import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { portfolios, trades } from "@/db/schema";
import { AccountKind } from "@/lib/account";
import { requireUserId } from "@/lib/auth";
import { DEFAULT_CURRENCY } from "@/lib/currency";

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

// Creating the default account on first read is idempotent: a partial unique index turns a repeat into a no-op.
// react-doctor-disable-next-line react-doctor/tanstack-start-get-mutation
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
