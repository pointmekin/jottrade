import { z } from "zod";
import {
	NO_STRATEGY,
	type ScopeSearch,
	scopeSearchSchema,
} from "./journal-search";
import { parseTagIds } from "./trade-tag";

export const SAVED_VIEW_NAME_MAX_LENGTH = 60;
export const SAVED_VIEW_LIMIT = 50;

export const savedViewNameSchema = z
	.string()
	.trim()
	.min(1, "Enter a view name.")
	.max(
		SAVED_VIEW_NAME_MAX_LENGTH,
		`Use ${SAVED_VIEW_NAME_MAX_LENGTH} characters or fewer.`,
	);

/** The URL scope with civil dates; the browser resolves them in its own timezone, as for a link. */
export const savedViewScopeSchema = scopeSearchSchema
	.omit({ savedView: true })
	.extend({
		dateFrom: z.iso.date().optional(),
		dateTo: z.iso.date().optional(),
	});

export type SavedViewScope = z.infer<typeof savedViewScopeSchema>;

/** `pinnedAccount` remembers a bound account after its delete sets portfolio_id to null. */
export const storedViewScopeSchema = savedViewScopeSchema.extend({
	v: z.literal(1),
	pinnedAccount: z.boolean(),
});

const SCOPE_KEYS = savedViewScopeSchema.keyof().options;

export function pickViewScope(search: Partial<ScopeSearch>) {
	return Object.fromEntries(
		SCOPE_KEYS.map((key) => [key, search[key]]),
	) as Partial<SavedViewScope>;
}

export const isSameScope = (
	current: Partial<ScopeSearch>,
	saved: SavedViewScope,
) => SCOPE_KEYS.every((key) => current[key] === saved[key]);

/** A deleted strategy or tag leaves its id in the view; the id drops out so the view does not match nothing. */
export function dropUnknownIds(
	scope: SavedViewScope,
	known: { strategyIds: Set<number>; tagIds: Set<number> },
) {
	const isUnknownStrategy =
		scope.setupId !== undefined &&
		scope.setupId !== NO_STRATEGY &&
		!known.strategyIds.has(Number(scope.setupId));
	const tagIds = parseTagIds(scope.tags) ?? [];
	const keptTags = tagIds.filter((id) => known.tagIds.has(id));
	const droppedFilters =
		Number(isUnknownStrategy) + tagIds.length - keptTags.length;
	if (!droppedFilters) return { scope, droppedFilters };
	return {
		scope: {
			...scope,
			setupId: isUnknownStrategy ? undefined : scope.setupId,
			tags: keptTags.length ? keptTags.join(",") : undefined,
			tagMatch: keptTags.length ? scope.tagMatch : undefined,
		},
		droppedFilters,
	};
}
