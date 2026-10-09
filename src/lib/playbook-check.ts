import { z } from "zod";
import { playbookCriterionSchema, type Strategy } from "./playbook";

export const CriterionResult = {
	Followed: "followed",
	Broke: "broke",
} as const;

export type CriterionResult =
	(typeof CriterionResult)[keyof typeof CriterionResult];

export const PlanAdherence = {
	Followed: "followed",
	Broken: "broken",
	Unchecked: "unchecked",
} as const;

export type PlanAdherence = (typeof PlanAdherence)[keyof typeof PlanAdherence];

export const playbookCheckSchema = z.object({
	v: z.literal(1),
	strategyId: z.number().int().positive(),
	strategyName: z.string(),
	criteriaVersion: z.number().int().positive(),
	items: z.array(
		playbookCriterionSchema.extend({
			result: z.enum(CriterionResult).nullable(),
		}),
	),
	result: z.enum([PlanAdherence.Followed, PlanAdherence.Broken]),
	checkedAt: z.iso.datetime(),
});

export type PlaybookCheck = z.infer<typeof playbookCheckSchema>;

type CheckedStrategy = Pick<
	Strategy,
	"id" | "name" | "criteria" | "criteriaVersion"
>;

/** The snapshot copies the criteria, so a later playbook edit does not change it. */
export function buildPlaybookCheck(
	strategy: CheckedStrategy,
	results: Record<string, CriterionResult>,
	checkedAt: Date,
): PlaybookCheck {
	if (!strategy.criteria.length)
		throw new Error("This playbook has no criteria yet.");
	const items = strategy.criteria.map((criterion) => ({
		...criterion,
		result: results[criterion.id] ?? null,
	}));
	const required = items.filter((item) => item.required);
	if (required.some((item) => item.result === null))
		throw new Error("Answer every required criterion.");
	return {
		v: 1,
		strategyId: strategy.id,
		strategyName: strategy.name,
		criteriaVersion: strategy.criteriaVersion,
		items,
		result: required.some((item) => item.result === CriterionResult.Broke)
			? PlanAdherence.Broken
			: PlanAdherence.Followed,
		checkedAt: checkedAt.toISOString(),
	};
}

export function isPlaybookCheckStale(
	check: PlaybookCheck,
	setupId: number | null,
	strategy: Pick<Strategy, "id" | "criteriaVersion"> | null,
) {
	return (
		check.strategyId !== setupId ||
		check.strategyId !== strategy?.id ||
		check.criteriaVersion !== strategy.criteriaVersion
	);
}
