// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	search: {} as { token?: string; error?: string },
	requestPasswordReset: vi.fn(),
	resetPassword: vi.fn(),
	changePassword: vi.fn(),
	listAccounts: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: object) => ({ options }),
	useSearch: () => mocks.search,
	Link: ({ to, children }: { to: string; children: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		requestPasswordReset: mocks.requestPasswordReset,
		resetPassword: mocks.resetPassword,
		changePassword: mocks.changePassword,
		listAccounts: mocks.listAccounts,
	},
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

type Page = { options: { component: () => ReactNode } };
const ForgotPassword = (
	(await import("@/routes/_unauthenticated/forgot-password"))
		.Route as unknown as Page
).options.component;
const ResetPassword = (
	(await import("@/routes/_unauthenticated/reset-password"))
		.Route as unknown as Page
).options.component;
const { PasswordSettings } = await import(
	"@/components/profile/password-settings"
);

const GENERIC = "If an account exists for this email, we sent a reset link.";

function fill(label: string | RegExp, value: string) {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function renderWithQuery(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>{node}</QueryClientProvider>,
	);
}

beforeAll(() => {
	// Radix Checkbox measures itself; jsdom has no ResizeObserver.
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.search = {};
});

describe("forgot password page", () => {
	it.each(["known@jottrade.test", "unknown@jottrade.test"])(
		"shows the same message for %s",
		async (email) => {
			mocks.requestPasswordReset.mockResolvedValue({
				data: { status: true },
				error: null,
			});
			render(<ForgotPassword />);

			fill("Email", email);
			fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

			expect(await screen.findByText(GENERIC)).toBeTruthy();
			expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
				email,
				redirectTo: "/reset-password",
			});
		},
	);

	it("shows the error when the request fails", async () => {
		mocks.requestPasswordReset.mockResolvedValue({
			data: null,
			error: {
				status: 429,
				message: "Too many requests. Please try again later.",
			},
		});
		render(<ForgotPassword />);

		fill("Email", "known@jottrade.test");
		fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

		expect(await screen.findByRole("alert")).toHaveProperty(
			"textContent",
			"Too many requests. Please try again later.",
		);
		expect(screen.queryByText(GENERIC)).toBeNull();
	});
});

describe("reset password page", () => {
	it.each([{}, { error: "INVALID_TOKEN" }])(
		"shows a link to request a new one for %o",
		(search) => {
			mocks.search = search;
			render(<ResetPassword />);

			expect(screen.getByText(/expired or was already used/i)).toBeTruthy();
			expect(
				screen
					.getByRole("link", { name: "Request a new link" })
					.getAttribute("href"),
			).toBe("/forgot-password");
		},
	);

	it.each([
		["short", "short", /at least 8 characters/i],
		["long-enough-1", "long-enough-2", /do not match/i],
	])(
		"rejects %s / %s before it calls the server",
		(password, confirm, message) => {
			mocks.search = { token: "token-1" };
			render(<ResetPassword />);

			fill("New password", password);
			fill("Confirm new password", confirm);
			fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

			expect(screen.getByRole("alert").textContent).toMatch(message);
			expect(mocks.resetPassword).not.toHaveBeenCalled();
		},
	);

	it("resets the password with the token from the link", async () => {
		mocks.search = { token: "token-1" };
		mocks.resetPassword.mockResolvedValue({
			data: { status: true },
			error: null,
		});
		render(<ResetPassword />);

		fill("New password", "new-password-1");
		fill("Confirm new password", "new-password-1");
		fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

		expect(await screen.findByText(/your password changed/i)).toBeTruthy();
		expect(mocks.resetPassword).toHaveBeenCalledWith({
			newPassword: "new-password-1",
			token: "token-1",
		});
	});

	it("shows the expired-link message when the server rejects the token", async () => {
		mocks.search = { token: "used-token" };
		mocks.resetPassword.mockResolvedValue({
			data: null,
			error: { code: "INVALID_TOKEN", message: "Invalid token" },
		});
		render(<ResetPassword />);

		fill("New password", "new-password-1");
		fill("Confirm new password", "new-password-1");
		fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

		expect(
			await screen.findByText(/expired or was already used/i),
		).toBeTruthy();
	});
});

describe("profile password settings", () => {
	it("tells a Google-only user how to set a password", async () => {
		mocks.listAccounts.mockResolvedValue({
			data: [{ providerId: "google" }],
			error: null,
		});
		renderWithQuery(<PasswordSettings />);

		expect(await screen.findByText(/you sign in with google/i)).toBeTruthy();
		expect(screen.getByText(/forgot password\?/i)).toBeTruthy();
		expect(screen.queryByLabelText("Current password")).toBeNull();
	});

	it("rejects a new password that does not match", async () => {
		mocks.listAccounts.mockResolvedValue({
			data: [{ providerId: "credential" }],
			error: null,
		});
		renderWithQuery(<PasswordSettings />);

		await screen.findByLabelText("Current password");
		fill("Current password", "old-password");
		fill("New password", "new-password-1");
		fill("Confirm new password", "new-password-2");
		fireEvent.click(screen.getByRole("button", { name: "Change password" }));

		expect(screen.getByRole("alert").textContent).toMatch(/do not match/i);
		expect(mocks.changePassword).not.toHaveBeenCalled();
	});

	it("changes the password and can sign out other devices", async () => {
		mocks.listAccounts.mockResolvedValue({
			data: [{ providerId: "credential" }],
			error: null,
		});
		mocks.changePassword.mockResolvedValue({ data: {}, error: null });
		renderWithQuery(<PasswordSettings />);

		await screen.findByLabelText("Current password");
		fill("Current password", "old-password");
		fill("New password", "new-password-1");
		fill("Confirm new password", "new-password-1");
		fireEvent.click(screen.getByLabelText("Sign out of other devices"));
		fireEvent.click(screen.getByRole("button", { name: "Change password" }));

		await waitFor(() =>
			expect(mocks.changePassword).toHaveBeenCalledWith({
				currentPassword: "old-password",
				newPassword: "new-password-1",
				revokeOtherSessions: true,
			}),
		);
		await waitFor(() =>
			expect(
				(screen.getByLabelText("Current password") as HTMLInputElement).value,
			).toBe(""),
		);
	});

	it("shows the server error, for example a wrong current password", async () => {
		mocks.listAccounts.mockResolvedValue({
			data: [{ providerId: "credential" }],
			error: null,
		});
		mocks.changePassword.mockResolvedValue({
			data: null,
			error: { code: "INVALID_PASSWORD", message: "Invalid password" },
		});
		renderWithQuery(<PasswordSettings />);

		await screen.findByLabelText("Current password");
		fill("Current password", "wrong-password");
		fill("New password", "new-password-1");
		fill("Confirm new password", "new-password-1");
		fireEvent.click(screen.getByRole("button", { name: "Change password" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Invalid password",
		);
	});
});
