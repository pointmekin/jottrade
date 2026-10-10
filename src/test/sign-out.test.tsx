// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignOutDialog } from "@/components/sign-out-dialog";
import { useSignOut } from "@/hooks/use-sign-out";
import { reviewDraftKey } from "@/lib/review-draft";
import { tradeDraftKey } from "@/lib/trade-draft";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	signOut: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ navigate: mocks.navigate }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: { user: { id: "alice" } } }),
		signOut: mocks.signOut,
	},
}));

function SignOutButton() {
	const signOut = useSignOut();
	return (
		<>
			<button type="button" onClick={signOut.requestSignOut}>
				Sign out
			</button>
			<SignOutDialog {...signOut} />
		</>
	);
}

function renderSignOut() {
	const queryClient = new QueryClient();
	queryClient.setQueryData(["trades"], [{ id: 1 }]);
	render(<SignOutButton />, {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		),
	});
	return queryClient;
}

beforeEach(() => {
	mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
});

afterEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
});

describe("sign out", () => {
	it("signs out with no dialog when the user has no drafts, and clears the query cache", async () => {
		localStorage.setItem(tradeDraftKey("bob", 1), "{}");
		const queryClient = renderSignOut();

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(mocks.navigate).toHaveBeenCalledWith({ to: "/sign-in" });
		expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
		expect(localStorage.getItem(tradeDraftKey("bob", 1))).toBe("{}");
	});

	it("warns first, then deletes the user's drafts and signs out", async () => {
		localStorage.setItem(tradeDraftKey("alice", 1), "{}");
		localStorage.setItem(reviewDraftKey("alice", 1, "trade:2"), "{}");
		localStorage.setItem(tradeDraftKey("bob", 1), "{}");
		const queryClient = renderSignOut();

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain(
			"2 drafts on this device are not in your journal. Signing out deletes them.",
		);
		await waitFor(() =>
			expect(document.activeElement).toBe(
				screen.getByRole("button", { name: "Cancel" }),
			),
		);
		expect(mocks.signOut).not.toHaveBeenCalled();

		fireEvent.click(
			screen.getByRole("button", { name: "Delete drafts and sign out" }),
		);

		await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
		expect(localStorage.getItem(tradeDraftKey("alice", 1))).toBeNull();
		expect(
			localStorage.getItem(reviewDraftKey("alice", 1, "trade:2")),
		).toBeNull();
		expect(localStorage.getItem(tradeDraftKey("bob", 1))).toBe("{}");
		expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
	});

	it("keeps the drafts and the session when the user cancels", async () => {
		localStorage.setItem(tradeDraftKey("alice", 1), "{}");
		renderSignOut();

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
		fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(mocks.signOut).not.toHaveBeenCalled();
		expect(localStorage.getItem(tradeDraftKey("alice", 1))).toBe("{}");
	});

	it.each([
		["the server returns an error", { data: null, error: { status: 500 } }],
		["the device is offline", new TypeError("Failed to fetch")],
	])(
		"keeps the drafts, the session and the cache when %s",
		async (_, result) => {
			if (result instanceof Error) mocks.signOut.mockRejectedValueOnce(result);
			else mocks.signOut.mockResolvedValueOnce(result);
			localStorage.setItem(tradeDraftKey("alice", 1), "{}");
			const queryClient = renderSignOut();

			fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
			fireEvent.click(
				await screen.findByRole("button", {
					name: "Delete drafts and sign out",
				}),
			);

			await waitFor(() =>
				expect(mocks.toastError).toHaveBeenCalledWith(
					"Couldn't sign out. Your drafts are kept. Try again.",
				),
			);
			expect(localStorage.getItem(tradeDraftKey("alice", 1))).toBe("{}");
			expect(mocks.navigate).not.toHaveBeenCalled();
			expect(queryClient.getQueryData(["trades"])).toEqual([{ id: 1 }]);
		},
	);
});
