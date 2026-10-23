// @vitest-environment jsdom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	session: { data: null as object | null, isPending: false },
	social: vi.fn(),
	signInEmail: vi.fn(),
	navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: object) => ({ options }),
	redirect: vi.fn(),
	useRouter: () => ({ navigate: mocks.navigate }),
	Link: ({ to, children }: { to: string; children: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => mocks.session,
		signIn: { social: mocks.social, email: mocks.signInEmail },
		signUp: { email: vi.fn() },
	},
}));

type Page = { options: { component: () => ReactNode } };
const SignIn = (
	(await import("@/routes/_unauthenticated/sign-in")).Route as unknown as Page
).options.component;
const SignUp = (
	(await import("@/routes/_unauthenticated/sign-up")).Route as unknown as Page
).options.component;

const GOOGLE_BUTTON = /Sign in with Google|Redirecting to Google/;

function isDisabled(element: HTMLElement) {
	return element.matches(":disabled");
}

function pendingPromise() {
	return new Promise<never>(() => {});
}

beforeEach(() => {
	mocks.session.data = null;
	mocks.session.isPending = false;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("Google button", () => {
	it("shows a busy state and locks the form while it redirects", async () => {
		mocks.social.mockReturnValue(pendingPromise());
		render(<SignIn />);

		fireEvent.click(screen.getByRole("button", { name: GOOGLE_BUTTON }));

		const button = await screen.findByRole("button", {
			name: "Redirecting to Google…",
		});
		expect(button).toHaveProperty("disabled", true);
		expect(button.getAttribute("aria-busy")).toBe("true");
		expect(screen.getByRole("status").textContent).toBe(
			"Redirecting to Google",
		);
		expect(isDisabled(screen.getByLabelText("Email"))).toBe(true);
		expect(isDisabled(screen.getByRole("button", { name: "Sign In" }))).toBe(
			true,
		);
		expect(mocks.social).toHaveBeenCalledWith({
			provider: "google",
			callbackURL: "/dashboard",
		});
	});

	it("shows the error and unlocks the page when Google cannot start", async () => {
		mocks.social.mockResolvedValue({ error: { message: "Provider is off" } });
		render(<SignIn />);

		fireEvent.click(screen.getByRole("button", { name: GOOGLE_BUTTON }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Provider is off",
		);
		expect(
			isDisabled(screen.getByRole("button", { name: "Sign in with Google" })),
		).toBe(false);
		expect(isDisabled(screen.getByLabelText("Email"))).toBe(false);
	});

	it("shows a message when the request throws", async () => {
		mocks.social.mockRejectedValue(new Error("offline"));
		render(<SignUp />);

		fireEvent.click(
			screen.getByRole("button", { name: /Sign up with Google|Redirecting/ }),
		);

		expect((await screen.findByRole("alert")).textContent).toMatch(
			/Couldn't reach Google/,
		);
	});

	it("is locked while the email form submits", async () => {
		mocks.signInEmail.mockReturnValue(pendingPromise());
		render(<SignIn />);
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "a@b.co" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

		await waitFor(() =>
			expect(
				isDisabled(screen.getByRole("button", { name: "Signing in…" })),
			).toBe(true),
		);
		expect(
			isDisabled(screen.getByRole("button", { name: "Sign in with Google" })),
		).toBe(true);
	});

	it("resets when the browser restores the page from its cache", async () => {
		mocks.social.mockReturnValue(pendingPromise());
		render(<SignIn />);
		fireEvent.click(screen.getByRole("button", { name: GOOGLE_BUTTON }));
		await screen.findByRole("button", { name: "Redirecting to Google…" });

		act(() => {
			window.dispatchEvent(
				Object.assign(new Event("pageshow"), { persisted: true }),
			);
		});

		expect(
			isDisabled(screen.getByRole("button", { name: "Sign in with Google" })),
		).toBe(false);
	});
});

describe("session check", () => {
	it("shows the page frame with placeholders instead of the form", () => {
		mocks.session.isPending = true;
		render(<SignIn />);

		expect(screen.getByRole("heading", { name: "Welcome back" })).toBeDefined();
		expect(screen.queryByLabelText("Email")).toBeNull();
		expect(screen.queryByRole("button", { name: GOOGLE_BUTTON })).toBeNull();
		expect(screen.getByRole("status").textContent).toBe(
			"Checking your session",
		);
	});
});

describe("sign-up form", () => {
	it("states the password rule and enforces it in the field", () => {
		render(<SignUp />);

		const password = screen.getByLabelText("Password");
		expect(password.getAttribute("minlength")).toBe("8");
		expect(screen.getByText("Use at least 8 characters.")).toBeDefined();
		expect(password.getAttribute("aria-describedby")).toBeTruthy();
	});
});
