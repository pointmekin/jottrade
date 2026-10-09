import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { tags } from "@/db/schema";
import { bulkEditTrades as applyBulkEdit } from "@/db/trade-bulk-edit";
import { listTags } from "@/db/trade-tags";
import { isUniqueViolation } from "@/db/unique-violation";
import { bulkEditSchema, TagColor, tagNameSchema } from "@/lib/trade-tag";
import { authMiddleware } from "./auth-middleware";

const tagIdSchema = z.object({ id: z.number().int().positive() });
const tagColumns = { id: tags.id, name: tags.name, color: tags.color };
const DUPLICATE_NAME = "A tag with this name already exists.";

export const getTags = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { userId } = context;
		return listTags(userId);
	});

/** Creating a name that exists (in any letter case) returns the existing tag, so create-on-enter is safe to repeat. */
export const createTag = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			name: tagNameSchema,
			color: z.enum(TagColor).default(TagColor.Gray),
		}),
	)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const [created] = await db
			.insert(tags)
			.values({ userId, name: data.name, color: data.color })
			.onConflictDoNothing()
			.returning(tagColumns);
		if (created) return created;
		const [existing] = await db
			.select(tagColumns)
			.from(tags)
			.where(
				and(
					eq(tags.userId, userId),
					sql`lower(${tags.name}) = lower(${data.name})`,
				),
			);
		if (!existing) throw new Error("The tag was not saved. Try again.");
		return existing;
	});

export const updateTag = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		tagIdSchema
			.extend({
				name: tagNameSchema.optional(),
				color: z.enum(TagColor).optional(),
			})
			.refine((data) => data.name !== undefined || data.color !== undefined, {
				message: "Change the name or the color.",
			}),
	)
	.handler(async ({ data: { id, ...changes }, context }) => {
		const { userId } = context;
		try {
			const [tag] = await db
				.update(tags)
				.set(changes)
				.where(and(eq(tags.id, id), eq(tags.userId, userId)))
				.returning(tagColumns);
			if (!tag) throw new Error("Tag not found.");
			return tag;
		} catch (error) {
			if (isUniqueViolation(error)) throw new Error(DUPLICATE_NAME);
			throw error;
		}
	});

/** Deleting a tag removes it from every trade; the trades stay. */
export const deleteTag = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(tagIdSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		const deleted = await db
			.delete(tags)
			.where(and(eq(tags.id, data.id), eq(tags.userId, userId)))
			.returning({ id: tags.id });
		if (!deleted.length) throw new Error("Tag not found.");
		return { success: true };
	});

export const bulkEditTrades = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(bulkEditSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		await requireOwnedPortfolio(userId, data.portfolioId);
		return applyBulkEdit(userId, data);
	});
