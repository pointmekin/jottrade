import { z } from "zod";
import { TradeConfidence } from "./trade";

export const TagColor = {
	Gray: "gray",
	Blue: "blue",
	Violet: "violet",
	Teal: "teal",
	Amber: "amber",
	Pink: "pink",
} as const;

export type TagColor = (typeof TagColor)[keyof typeof TagColor];

export const TagMatch = {
	Any: "any",
	All: "all",
} as const;

export type TagMatch = (typeof TagMatch)[keyof typeof TagMatch];

export type TradeTag = { id: number; name: string; color: TagColor };

export const TAG_NAME_MAX_LENGTH = 32;
export const BULK_EDIT_LIMIT = 500;

/** Trims and collapses inner whitespace, so "  Late   entry " and "Late entry" are one tag. */
export function normalizeTagName(name: string) {
	return name.normalize("NFC").trim().replace(/\s+/g, " ");
}

export const tagNameSchema = z
	.string()
	.transform(normalizeTagName)
	.pipe(
		z
			.string()
			.min(1, "Enter a tag name.")
			.max(
				TAG_NAME_MAX_LENGTH,
				`Use ${TAG_NAME_MAX_LENGTH} characters or fewer.`,
			),
	);

export const sameTagName = (a: string, b: string) =>
	normalizeTagName(a).toLowerCase() === normalizeTagName(b).toLowerCase();

const idSchema = z.number().int().positive();

export const tradeIdsSchema = z
	.array(idSchema)
	.min(1, "Select at least one trade.")
	.transform((ids) => [...new Set(ids)])
	.pipe(
		z
			.array(idSchema)
			.max(
				BULK_EDIT_LIMIT,
				`Bulk edit works on up to ${BULK_EDIT_LIMIT} trades at a time. Narrow the filter and try again.`,
			),
	);

const tagIdsSchema = z
	.array(idSchema)
	.min(1, "Choose at least one tag.")
	.max(50)
	.transform((ids) => [...new Set(ids)]);

export const BulkTradeAction = {
	AddTags: "add-tags",
	RemoveTags: "remove-tags",
	SetStrategy: "set-strategy",
	SetConfidence: "set-confidence",
	MarkReviewed: "mark-reviewed",
} as const;

export type BulkTradeAction =
	(typeof BulkTradeAction)[keyof typeof BulkTradeAction];

export const bulkTradeChangeSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal(BulkTradeAction.AddTags),
		tagIds: tagIdsSchema,
	}),
	z.object({
		action: z.literal(BulkTradeAction.RemoveTags),
		tagIds: tagIdsSchema,
	}),
	z.object({
		action: z.literal(BulkTradeAction.SetStrategy),
		setupId: idSchema.nullable(),
	}),
	z.object({
		action: z.literal(BulkTradeAction.SetConfidence),
		confidence: z.enum(TradeConfidence).nullable(),
	}),
	z.object({ action: z.literal(BulkTradeAction.MarkReviewed) }),
]);

export type BulkTradeChange = z.infer<typeof bulkTradeChangeSchema>;

export const bulkEditSchema = z.object({
	portfolioId: idSchema,
	tradeIds: tradeIdsSchema,
	change: bulkTradeChangeSchema,
});

export type BulkEditInput = z.infer<typeof bulkEditSchema>;

export type BulkEditResult = { selected: number; changed: number };

/** Tag ids in the URL are comma-separated; anything that is not a positive id is ignored. */
export function parseTagIds(value?: string) {
	if (!value) return undefined;
	const ids = value
		.split(",")
		.map(Number)
		.filter((id) => Number.isInteger(id) && id > 0);
	return ids.length ? [...new Set(ids)] : undefined;
}
