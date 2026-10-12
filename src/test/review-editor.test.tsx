// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import { ReviewEditor } from "@/components/reviews/review-editor";
import {
	EMPTY_REVIEW_FIELDS,
	ReviewKind,
	ReviewStatus,
	summarizeReview,
} from "@/lib/review";

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useMutation: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="/reviews">{children}</a>
	),
}));
vi.mock("@/server/reviewActions", () => ({
	getReviewPeriod: vi.fn(),
	saveReviewPeriod: vi.fn(),
	reopenReviewPeriod: vi.fn(),
}));
vi.mock("@/hooks/use-review-autosave", () => ({
	useReviewAutosave: () => ({
		fields: { ...EMPTY_REVIEW_FIELDS, notes: "Pending local draft" },
		revision: 1,
		status: "conflict",
		serverFields: EMPTY_REVIEW_FIELDS,
		error: null,
		edit: vi.fn(),
		flush: vi.fn(),
		reload: vi.fn(),
		resolve: vi.fn(),
	}),
}));
it("shows completed saved text while retaining a conflicting local draft for recovery", () => {
	const fields = { ...EMPTY_REVIEW_FIELDS, notes: "Frozen completed notes" };
	const review = {
		fields,
		revision: 2,
		currency: "USD",
		liveCurrency: "USD",
		previousCommitment: null,
		window: {
			periodStart: "2026-10-02",
			periodEndExclusive: "2026-10-03",
			timezoneSnapshot: "UTC",
		},
		period: {
			status: ReviewStatus.Complete,
			id: 1,
			resultSnapshot: summarizeReview([], []),
		},
		sources: { trades: [], flows: [], results: summarizeReview([], []) },
		tradeLinks: [],
		flowLinks: [],
	} as unknown as ComponentProps<typeof ReviewEditor>["review"];
	render(
		<ReviewEditor
			review={review}
			userId="u1"
			portfolioId={1}
			kind={ReviewKind.Daily}
		/>,
	);
	expect(
		(screen.getByLabelText("Day / period notes") as HTMLTextAreaElement).value,
	).toBe("Frozen completed notes");
	expect(screen.getByRole("alert").textContent).toContain(
		"pending draft is kept",
	);
	expect(screen.getByRole("button", { name: "Copy review text" })).toBeTruthy();
});
