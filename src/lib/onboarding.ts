import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currency";
import { isValidTimeZone } from "./date";

export const OnboardingStep = {
	Account: "account",
	Funding: "funding",
	Trades: "trades",
	Review: "review",
} as const;

export type OnboardingStep =
	(typeof OnboardingStep)[keyof typeof OnboardingStep];

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
	OnboardingStep.Account,
	OnboardingStep.Funding,
	OnboardingStep.Trades,
	OnboardingStep.Review,
];

export interface OnboardingFacts {
	isAccountConfigured: boolean;
	hasFunding: boolean;
	hasTrades: boolean;
	hasCompletedReview: boolean;
}

export interface OnboardingProgress {
	steps: { step: OnboardingStep; isDone: boolean }[];
	doneCount: number;
	totalCount: number;
	nextStep: OnboardingStep | null;
	isComplete: boolean;
}

const FACT_BY_STEP = {
	[OnboardingStep.Account]: "isAccountConfigured",
	[OnboardingStep.Funding]: "hasFunding",
	[OnboardingStep.Trades]: "hasTrades",
	[OnboardingStep.Review]: "hasCompletedReview",
} as const satisfies Record<OnboardingStep, keyof OnboardingFacts>;

export function deriveOnboarding(facts: OnboardingFacts): OnboardingProgress {
	const steps = ONBOARDING_STEPS.map((step) => ({
		step,
		isDone: facts[FACT_BY_STEP[step]],
	}));
	const doneCount = steps.filter((entry) => entry.isDone).length;
	const next = steps.find((entry) => !entry.isDone);
	return {
		steps,
		doneCount,
		totalCount: steps.length,
		nextStep: next?.step ?? null,
		isComplete: doneCount === steps.length,
	};
}

export const firstAccountSchema = z.object({
	name: z.string().trim().min(1).max(64),
	broker: z.string().trim().max(120),
	currency: z.enum(SUPPORTED_CURRENCIES),
	timezone: z.string().refine(isValidTimeZone, "Invalid IANA timezone"),
});

export type FirstAccountInput = z.infer<typeof firstAccountSchema>;
