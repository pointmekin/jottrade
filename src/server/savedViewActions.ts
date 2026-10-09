import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { savedViews, strategies, tags } from "@/db/schema";
import { isUniqueViolation } from "@/db/unique-violation";
import {
	dropUnknownIds,
	SAVED_VIEW_LIMIT,
	savedViewNameSchema,
	savedViewScopeSchema,
	storedViewScopeSchema,
} from "@/lib/saved-view";
import { authMiddleware } from "./auth-middleware";

const DUPLICATE_NAME = "A view with this name already exists.";
const NOT_FOUND = "Saved view not found.";

const viewIdSchema = z.object({ id: z.number().int().positive() });
const viewContentSchema = z.object({
	scope: savedViewScopeSchema,
	portfolioId: z.number().int().positive().nullable(),
});

const ownedView = (userId: string, id: number) =>
	and(eq(savedViews.id, id), eq(savedViews.userId, userId));

async function toStoredScope(
	userId: string,
	{ scope, portfolioId }: z.infer<typeof viewContentSchema>,
) {
	if (portfolioId !== null) await requireOwnedPortfolio(userId, portfolioId);
	return { ...scope, v: 1, pinnedAccount: portfolioId !== null } as const;
}

function toView(
	row: { id: number; name: string; portfolioId: number | null; scope: unknown },
	known: { strategyIds: Set<number>; tagIds: Set<number> },
) {
	const stored = storedViewScopeSchema.parse(row.scope);
	return {
		id: row.id,
		name: row.name,
		portfolioId: row.portfolioId,
		accountRemoved: stored.pinnedAccount && row.portfolioId === null,
		...dropUnknownIds(savedViewScopeSchema.parse(stored), known),
	};
}

export type SavedView = ReturnType<typeof toView>;

export const getSavedViews = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { userId } = context;
		const [rows, strategyRows, tagRows] = await Promise.all([
			db
				.select({
					id: savedViews.id,
					name: savedViews.name,
					portfolioId: savedViews.portfolioId,
					scope: savedViews.scope,
				})
				.from(savedViews)
				.where(eq(savedViews.userId, userId))
				.orderBy(asc(sql`lower(${savedViews.name})`)),
			db
				.select({ id: strategies.id })
				.from(strategies)
				.where(eq(strategies.userId, userId)),
			db.select({ id: tags.id }).from(tags).where(eq(tags.userId, userId)),
		]);
		const known = {
			strategyIds: new Set(strategyRows.map((row) => row.id)),
			tagIds: new Set(tagRows.map((row) => row.id)),
		};
		return rows.map((row) => toView(row, known));
	});

export const createSavedView = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(viewContentSchema.extend({ name: savedViewNameSchema }))
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const [scope, [{ total }]] = await Promise.all([
			toStoredScope(userId, data),
			db
				.select({ total: count() })
				.from(savedViews)
				.where(eq(savedViews.userId, userId)),
		]);
		if (total >= SAVED_VIEW_LIMIT)
			throw new Error(
				`You can save up to ${SAVED_VIEW_LIMIT} views. Delete one first.`,
			);
		const [view] = await db
			.insert(savedViews)
			.values({ userId, portfolioId: data.portfolioId, name: data.name, scope })
			.onConflictDoNothing()
			.returning({ id: savedViews.id });
		if (!view) throw new Error(DUPLICATE_NAME);
		return view;
	});

export const renameSavedView = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(viewIdSchema.extend({ name: savedViewNameSchema }))
	.handler(async ({ data, context }) => {
		try {
			const [view] = await db
				.update(savedViews)
				.set({ name: data.name })
				.where(ownedView(context.userId, data.id))
				.returning({ id: savedViews.id });
			if (!view) throw new Error(NOT_FOUND);
			return view;
		} catch (error) {
			if (isUniqueViolation(error)) throw new Error(DUPLICATE_NAME);
			throw error;
		}
	});

export const updateSavedViewScope = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(viewIdSchema.extend(viewContentSchema.shape))
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const scope = await toStoredScope(userId, data);
		const [view] = await db
			.update(savedViews)
			.set({ portfolioId: data.portfolioId, scope })
			.where(ownedView(userId, data.id))
			.returning({ id: savedViews.id });
		if (!view) throw new Error(NOT_FOUND);
		return view;
	});

export const deleteSavedView = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(viewIdSchema)
	.handler(async ({ data, context }) => {
		const deleted = await db
			.delete(savedViews)
			.where(ownedView(context.userId, data.id))
			.returning({ id: savedViews.id });
		if (!deleted.length) throw new Error(NOT_FOUND);
		return { success: true };
	});
