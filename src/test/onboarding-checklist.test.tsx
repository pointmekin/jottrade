// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { deriveOnboarding } from "@/lib/onboarding";

const mocks = vi.hoisted(() => ({
	onboarding: {} as Record<string, unknown>,
	dismiss: vi.fn(),
}));

vi.mock("@/hooks/use-onboarding", () => ({
	useOnboarding: () => mocks.onboarding,
}));
vi.mock("@/server/onboardingActions", () => ({
	setOnboardingDismissed: mocks.dismiss,
}));
vi.mock("@/components/onboarding/first-account-dialog", () => ({
	FirstAccountDialog: ({ open }: { open: boolean }) =>
		open ? <p>account dialog</p> : null,
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

const facts = {
	isAccountConfigured: false,
	hasFunding: false,
	hasTrades: false,
	hasCompletedReview: false,
};

function show(overrides: Partial<typeof facts>, isDismissed = false) {
	const progress = deriveOnboarding({ ...facts, ...overrides });
	mocks.onboarding = {
		progress,
		isDismissed,
		isChecklistVisible: !isDismissed && !progress.isComplete,
	};
	return render(
		<QueryClientProvider client={new QueryClient()}>
			<OnboardingChecklist />
		</QueryClientProvider>,
	);
}

describe("OnboardingChecklist", () => {
	beforeEach(() => mocks.dismiss.mockReset());

	it("opens the account dialog from the first step", () => {
		show({});

		fireEvent.click(screen.getByRole("button", { name: "Set up account" }));

		expect(screen.getByText("account dialog")).toBeTruthy();
	});

	it("shows progress from the real facts", () => {
		show({ isAccountConfigured: true, hasFunding: true });

		expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
			"2",
		);
		expect(screen.getByRole("link", { name: "Log a trade" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Set up account" })).toBeNull();
	});

	it("dismisses on request", async () => {
		show({});

		fireEvent.click(
			screen.getByRole("button", { name: "Dismiss setup guide" }),
		);

		await waitFor(() =>
			expect(mocks.dismiss).toHaveBeenCalledWith({
				data: { isDismissed: true },
			}),
		);
	});

	it("renders nothing when dismissed or complete", () => {
		const dismissed = show({}, true);
		expect(dismissed.container.innerHTML).toBe("");
		dismissed.unmount();

		const complete = show({
			isAccountConfigured: true,
			hasFunding: true,
			hasTrades: true,
			hasCompletedReview: true,
		});
		expect(complete.container.innerHTML).toBe("");
	});
});
