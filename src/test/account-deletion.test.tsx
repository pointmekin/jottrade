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
import { afterEach, describe, expect, it, vi } from "vitest";

const EMAIL = "trader@jottrade.test";

const mocks = vi.hoisted(() => ({
	listAccounts: vi.fn(),
	deleteUser: vi.fn(),
	navigate: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: { user: { email: EMAIL } } }),
		listAccounts: mocks.listAccounts,
		deleteUser: mocks.deleteUser,
	},
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	Link: ({ to, children }: { to: string; children: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const { AccountDeletion } = await import(
	"@/components/profile/account-deletion"
);

function renderDeletion(providerId: string) {
	mocks.listAccounts.mockResolvedValue({
		data: [{ providerId }],
		error: null,
	});
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<AccountDeletion />
		</QueryClientProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
}

function confirmButton() {
	const buttons = screen.getAllByRole<HTMLButtonElement>("button", {
		name: "Delete account",
	});
	return buttons[buttons.length - 1];
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("account deletion", () => {
	it("states the scope and links to the archive export", async () => {
		renderDeletion("credential");

		const dialog = await screen.findByRole("alertdialog");
		for (const item of [
			/trading accounts, trades and funding entries/i,
			/strategies, tags and saved views/i,
			/daily and weekly reviews/i,
			/trade screenshots/i,
			/sessions on all devices/i,
			/cannot undo/i,
		]) {
			expect(dialog.textContent).toMatch(item);
		}
		expect(
			screen
				.getByRole("link", { name: /download your archive/i })
				.getAttribute("href"),
		).toBe("/settings");
	});

	it("a password user must enter the password", async () => {
		mocks.deleteUser.mockResolvedValue({
			data: { success: true },
			error: null,
		});
		renderDeletion("credential");

		const password = await screen.findByLabelText("Current password");
		expect(confirmButton().disabled).toBe(true);
		fireEvent.change(password, { target: { value: "secret-password" } });
		expect(confirmButton().disabled).toBe(false);
		fireEvent.click(confirmButton());

		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" }),
		);
		expect(mocks.deleteUser).toHaveBeenCalledWith({
			password: "secret-password",
		});
		expect(mocks.toast.success).toHaveBeenCalledWith(
			"Your account was deleted.",
		);
	});

	it("a Google-only user must type the email", async () => {
		mocks.deleteUser.mockResolvedValue({
			data: { success: true },
			error: null,
		});
		renderDeletion("google");

		const email = await screen.findByLabelText(`Type ${EMAIL} to confirm`);
		expect(screen.queryByLabelText("Current password")).toBeNull();
		fireEvent.change(email, { target: { value: "other@jottrade.test" } });
		expect(confirmButton().disabled).toBe(true);
		fireEvent.change(email, { target: { value: EMAIL } });
		fireEvent.click(confirmButton());

		await waitFor(() => expect(mocks.deleteUser).toHaveBeenCalledWith({}));
	});

	it.each([
		[
			"INVALID_PASSWORD",
			"The password is not correct. Your account was not deleted.",
		],
		[
			"SESSION_EXPIRED",
			"Your account was not deleted. Sign out, sign in again, then try again.",
		],
		[undefined, "Your account was not deleted. Try again."],
	])(
		"shows the error for %s and does not leave the page",
		async (code, message) => {
			mocks.deleteUser.mockResolvedValue({ data: null, error: { code } });
			renderDeletion("credential");

			fireEvent.change(await screen.findByLabelText("Current password"), {
				target: { value: "secret-password" },
			});
			fireEvent.click(confirmButton());

			expect((await screen.findByRole("alert")).textContent).toBe(message);
			expect(mocks.navigate).not.toHaveBeenCalled();
		},
	);

	it("shows the generic error when the request throws", async () => {
		mocks.deleteUser.mockRejectedValue(new Error("network"));
		renderDeletion("credential");

		fireEvent.change(await screen.findByLabelText("Current password"), {
			target: { value: "secret-password" },
		});
		fireEvent.click(confirmButton());

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Your account was not deleted. Try again.",
		);
	});
});
