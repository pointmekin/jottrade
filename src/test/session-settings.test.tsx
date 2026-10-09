// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listSessions: vi.fn(),
	revokeSession: vi.fn(),
	revokeOtherSessions: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: { session: { id: "current" } } }),
		listSessions: mocks.listSessions,
		revokeSession: mocks.revokeSession,
		revokeOtherSessions: mocks.revokeOtherSessions,
	},
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const { SessionSettings } = await import(
	"@/components/profile/session-settings"
);

const CHROME_MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const SESSIONS = [
	{
		id: "other",
		token: "other-token",
		userAgent: SAFARI_IPHONE,
		ipAddress: "203.0.113.7",
		createdAt: new Date("2026-10-08T09:00:00Z"),
	},
	{
		id: "current",
		token: "current-token",
		userAgent: CHROME_MAC,
		ipAddress: null,
		createdAt: new Date("2026-10-09T09:00:00Z"),
	},
];

function renderSessions() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<SessionSettings />
		</QueryClientProvider>,
	);
}

async function rows() {
	return within(await screen.findByRole("list")).getAllByRole("listitem");
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("session settings", () => {
	it("lists each session and marks this device first", async () => {
		mocks.listSessions.mockResolvedValue({ data: SESSIONS, error: null });
		renderSessions();

		const [current, other] = await rows();

		expect(current.textContent).toContain("Chrome on macOS");
		expect(current.textContent).toContain("This device");
		expect(within(current).queryByRole("button")).toBeNull();
		expect(other.textContent).toContain("Safari on iOS");
		expect(other.textContent).toContain("203.0.113.7");
		expect(
			within(other).getByRole("button", { name: "Sign out" }),
		).toBeTruthy();
	});

	it("revokes another session only after the confirmation", async () => {
		mocks.listSessions.mockResolvedValue({ data: SESSIONS, error: null });
		mocks.revokeSession.mockResolvedValue({
			data: { status: true },
			error: null,
		});
		renderSessions();

		const [, other] = await rows();
		fireEvent.click(within(other).getByRole("button", { name: "Sign out" }));
		expect(mocks.revokeSession).not.toHaveBeenCalled();
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));

		await waitFor(() =>
			expect(mocks.revokeSession).toHaveBeenCalledWith({
				token: "other-token",
			}),
		);
		expect(mocks.toast.success).toHaveBeenCalled();
	});

	it("does not revoke when the user cancels", async () => {
		mocks.listSessions.mockResolvedValue({ data: SESSIONS, error: null });
		renderSessions();

		fireEvent.click(
			await screen.findByRole("button", {
				name: "Sign out of all other devices",
			}),
		);
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(mocks.revokeOtherSessions).not.toHaveBeenCalled();
	});

	it("shows an error toast when the revocation fails", async () => {
		mocks.listSessions.mockResolvedValue({ data: SESSIONS, error: null });
		mocks.revokeOtherSessions.mockResolvedValue({
			data: null,
			error: { message: "Unauthorized" },
		});
		renderSessions();

		fireEvent.click(
			await screen.findByRole("button", {
				name: "Sign out of all other devices",
			}),
		);
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.click(
			within(dialog).getByRole("button", {
				name: "Sign out of all other devices",
			}),
		);

		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith("Unauthorized"),
		);
		expect(mocks.toast.success).not.toHaveBeenCalled();
	});

	it("shows only this device when there is no other session", async () => {
		mocks.listSessions.mockResolvedValue({ data: [SESSIONS[1]], error: null });
		renderSessions();

		expect(
			await screen.findByText("No other device is signed in."),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Sign out of all other devices" }),
		).toBeNull();
	});

	it("asks for a new sign-in when the session is too old to list", async () => {
		mocks.listSessions.mockResolvedValue({
			data: null,
			error: { code: "SESSION_NOT_FRESH", message: "Session is not fresh" },
		});
		renderSessions();

		expect(await screen.findByText(/sign out and sign in again/i)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Sign out of all other devices" }),
		).toBeTruthy();
	});

	it("shows an error when the list does not load", async () => {
		mocks.listSessions.mockResolvedValue({
			data: null,
			error: { message: "Internal Server Error" },
		});
		renderSessions();

		expect(
			await screen.findByText(/could not load your sessions/i),
		).toBeTruthy();
	});
});
