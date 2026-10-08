import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ensureDefaultPortfolio } from "@/db/portfolios";
import { portfolios, trades } from "@/db/schema";
import { AccountKind } from "@/lib/account";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { authMiddleware } from "./auth-middleware";

export type AccountRecord = {
	id: number;
	name: string;
	description: string | null;
	kind: AccountKind;
	currency: string;
	isDefault: boolean;
	tradeCount: number;
};

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

async function readAccounts(userId: string): Promise<AccountRecord[]> {
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
	return rows.map((row) => toAccountRecord(row, row.tradeCount));
}

/** A read with no side effects. `useAccounts` calls `ensureDefaultAccount` when no account is the default. */
export const getAccounts = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(
		async ({ context }): Promise<AccountRecord[]> =>
			readAccounts(context.userId),
	);

export const ensureDefaultAccount = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<AccountRecord[]> => {
		await ensureDefaultPortfolio(context.userId);
		const accounts = await readAccounts(context.userId);
		// A concurrent delete can remove the account that the repair chose.
		if (!accounts.some((account) => account.isDefault)) {
			throw new Error("Could not set a default account. Reload the page.");
		}
		return accounts;
	});

const accountDetailsSchema = z.object({
	name: z.string().trim().min(1).max(64),
	description: z.string().trim().max(500),
	kind: z.enum([AccountKind.Real, AccountKind.Demo]),
	currency: z.string().trim().length(3).toUpperCase(),
});

export const createAccount = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(accountDetailsSchema)
	.handler(async ({ data, context }): Promise<AccountRecord> => {
		const { userId } = context;

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
	.middleware([authMiddleware])
	.validator(updateAccountSchema)
	.handler(async ({ data, context }): Promise<AccountRecord> => {
		const { userId } = context;

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
	.middleware([authMiddleware])
	.validator(deleteAccountSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;

		const [account] = await db
			.select()
			.from(portfolios)
			.where(and(eq(portfolios.id, data.id), eq(portfolios.userId, userId)));

		if (!account) throw new Error("Account not found.");
		if (account.name !== data.confirmName) {
			throw new Error("Account name does not match.");
		}

		const results = await db.batch([
			db.execute(
				sql`select id from portfolios where id=${data.id} and user_id=${userId} order by id for update`,
			),
			db.execute(
				sql`select id from trades where portfolio_id=${data.id} and user_id=${userId} order by id for update`,
			),
			db.execute(
				sql`select id from cash_flows where portfolio_id=${data.id} and user_id=${userId} order by id for update`,
			),
			db.execute(
				sql`delete from review_periods where portfolio_id=${data.id} and user_id=${userId} and exists(select 1 from portfolios where id=${data.id} and user_id=${userId} and name=${data.confirmName})`,
			),
			db
				.delete(portfolios)
				.where(
					and(
						eq(portfolios.id, data.id),
						eq(portfolios.userId, userId),
						eq(portfolios.name, data.confirmName),
					),
				)
				.returning({ id: portfolios.id }),
		]);
		if (!results[4].length)
			throw new Error("The account changed. Reload before deleting it.");

		// A failed promotion after deletion leaves no default; useAccounts then calls ensureDefaultAccount.
		if (account.isDefault) await ensureDefaultPortfolio(userId);

		return { success: true };
	});
