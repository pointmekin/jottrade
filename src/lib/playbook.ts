import { z } from "zod";
import type { strategies } from "@/db/schema";

export const PlaybookCriterionKind = {
	Entry: "entry",
	Invalidation: "invalidation",
} as const;

export type PlaybookCriterionKind =
	(typeof PlaybookCriterionKind)[keyof typeof PlaybookCriterionKind];

export const MAX_CRITERIA_PER_KIND = 20;

export const playbookCriterionSchema = z.object({
	id: z.string().min(1).max(40),
	kind: z.enum(PlaybookCriterionKind),
	text: z.string().trim().min(1, "Enter the criterion.").max(200),
	required: z.boolean(),
});

export type PlaybookCriterion = z.infer<typeof playbookCriterionSchema>;

export const playbookFieldsSchema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	description: z.string().max(1000).optional(),
	criteria: z
		.array(playbookCriterionSchema)
		.refine(
			(criteria) =>
				Object.values(PlaybookCriterionKind).every(
					(kind) =>
						criteria.filter((criterion) => criterion.kind === kind).length <=
						MAX_CRITERIA_PER_KIND,
				),
			`Use ${MAX_CRITERIA_PER_KIND} criteria or fewer in each list.`,
		),
	riskGuidance: z.string().trim().max(1000).optional(),
});

export type PlaybookFields = z.infer<typeof playbookFieldsSchema>;

export type Strategy = typeof strategies.$inferSelect;
