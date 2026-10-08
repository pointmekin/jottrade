import { describe, expect, it } from "vitest";
import {
	deriveOnboarding,
	firstAccountSchema,
	type OnboardingFacts,
	OnboardingStep,
} from "@/lib/onboarding";

const none: OnboardingFacts = {
	isAccountConfigured: false,
	hasFunding: false,
	hasTrades: false,
	hasCompletedReview: false,
};

describe("deriveOnboarding", () => {
	it("starts at the account step for a new user", () => {
		const progress = deriveOnboarding(none);

		expect(progress.doneCount).toBe(0);
		expect(progress.nextStep).toBe(OnboardingStep.Account);
		expect(progress.isComplete).toBe(false);
	});

	it("points at the first unfinished step, not the last finished one", () => {
		const progress = deriveOnboarding({
			...none,
			isAccountConfigured: true,
			hasTrades: true,
		});

		expect(progress.doneCount).toBe(2);
		expect(progress.nextStep).toBe(OnboardingStep.Funding);
	});

	it("reports every step in order with its own state", () => {
		const progress = deriveOnboarding({ ...none, hasFunding: true });

		expect(progress.steps.map((entry) => entry.step)).toEqual([
			OnboardingStep.Account,
			OnboardingStep.Funding,
			OnboardingStep.Trades,
			OnboardingStep.Review,
		]);
		expect(progress.steps.map((entry) => entry.isDone)).toEqual([
			false,
			true,
			false,
			false,
		]);
	});

	it("completes when all four facts hold", () => {
		const progress = deriveOnboarding({
			isAccountConfigured: true,
			hasFunding: true,
			hasTrades: true,
			hasCompletedReview: true,
		});

		expect(progress.isComplete).toBe(true);
		expect(progress.nextStep).toBeNull();
	});
});

describe("firstAccountSchema", () => {
	const valid = {
		name: " Exness Standard ",
		broker: "",
		currency: "USD",
		timezone: "Asia/Bangkok",
	};

	it("trims the name and accepts an empty broker", () => {
		expect(firstAccountSchema.parse(valid).name).toBe("Exness Standard");
	});

	it.each([
		["a blank name", { name: "  " }],
		["an unknown currency", { currency: "XXX" }],
		["an invalid timezone", { timezone: "Mars/Olympus" }],
	])("rejects %s", (_label, patch) => {
		expect(firstAccountSchema.safeParse({ ...valid, ...patch }).success).toBe(
			false,
		);
	});
});
