// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddToReviewButton } from "@/components/dashboard/add-to-review-button";
import { ReviewKind } from "@/lib/review";
import { TradeStatus } from "@/lib/trade";

const mocks = vi.hoisted(() => ({
	add: vi.fn(),
	navigate: vi.fn(),
	buildLocation: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
}));

vi.mock("@/server/reviewActions", () => ({ addReviewNextAction: mocks.add }));
vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({ activeAccount: { id: 7 } }),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useRouter: () => ({ buildLocation: mocks.buildLocation }),
	useSearch: () => ({ period: "30d" }),
}));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
}));

function renderButton() {
	const client = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	render(
		<AddToReviewButton
			text="Tag A."
			search={{ status: TradeStatus.Closed, tags: "3" }}
		/>,
		{ wrapper },
	);
	return screen.getByRole("button", { name: "Add to next review: Tag A." });
}

describe("AddToReviewButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.buildLocation.mockReturnValue({
			href: "/journal?period=30d&status=CLOSED&tags=3",
		});
	});

	it("sends the line with the scope link and opens the review from the toast", async () => {
		mocks.add.mockResolvedValue({ start: "2026-10-12", added: true });
		fireEvent.click(renderButton());

		await waitFor(() => expect(mocks.success).toHaveBeenCalled());
		expect(mocks.buildLocation).toHaveBeenCalledWith({
			to: "/journal",
			search: { period: "30d", status: TradeStatus.Closed, tags: "3" },
		});
		expect(mocks.add).toHaveBeenCalledWith({
			data: {
				portfolioId: 7,
				line: "- Tag A. Trades: /journal?period=30d&status=CLOSED&tags=3",
			},
		});
		const [message, options] = mocks.success.mock.calls[0];
		expect(message).toBe("Added to the next action of this week's review.");
		options.action.onClick();
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: "/reviews",
			search: { kind: ReviewKind.Weekly, start: "2026-10-12", account: 7 },
		});
	});

	it("says when the finding is already in the review", async () => {
		mocks.add.mockResolvedValue({ start: "2026-10-12", added: false });
		fireEvent.click(renderButton());

		await waitFor(() =>
			expect(mocks.success.mock.calls[0][0]).toBe(
				"This finding is already in this week's review.",
			),
		);
	});

	it("shows the server error and enables the button again", async () => {
		mocks.add.mockRejectedValue(
			new Error("Choose your review timezone first."),
		);
		const button = renderButton();
		fireEvent.click(button);

		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				"Could not add to the review. Choose your review timezone first.",
			),
		);
		expect(button.hasAttribute("disabled")).toBe(false);
	});
});
