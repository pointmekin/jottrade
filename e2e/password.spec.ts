import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { Pool } from "pg";
import { expect, open, test } from "./support";

const PASSWORD = "jottrade-old-password";
const NEW_PASSWORD = "jottrade-new-password";
const SENT =
	"If an account with a password exists for this email, we sent a reset link.";

// Production has no email key in the verify run, so the server does not send
// or log the link. The spec reads the token from the disposable database.
const pool = new Pool({ connectionString: process.env.VERIFY_DATABASE_URL });
test.afterAll(() => pool.end());

async function resetToken(email: string) {
	const { rows } = await pool.query<{ identifier: string }>(
		`SELECT v.identifier FROM verification v JOIN "user" u ON u.id = v.value
		 WHERE u.email = $1 AND v.identifier LIKE 'reset-password:%'
		 ORDER BY v.created_at DESC LIMIT 1`,
		[email],
	);
	expect(rows, `reset token for ${email}`).toHaveLength(1);
	return rows[0].identifier.replace("reset-password:", "");
}

// A new user for each test, so a password change never affects the seed users.
async function signUp(page: Page) {
	const email = `password-${randomUUID()}@jottrade.test`;
	const response = await page.request.post("/api/auth/sign-up/email", {
		data: { name: "Password Fixture", email, password: PASSWORD },
	});
	expect(response.ok(), `sign up ${email}`).toBe(true);
	return email;
}

function signInStatus(page: Page, email: string, password: string) {
	return page.request
		.post("/api/auth/sign-in/email", { data: { email, password } })
		.then((response) => response.status());
}

test("a user resets a forgotten password with the emailed link", async ({
	page,
}) => {
	const email = await signUp(page);
	await page.context().clearCookies();

	await open(page, "/sign-in");
	await page.getByRole("link", { name: "Forgot password?" }).click();
	await page.getByLabel("Email").fill(email);
	await page.getByRole("button", { name: "Send reset link" }).click();
	await expect(page.getByText(SENT)).toBeVisible();

	const link = `/api/auth/reset-password/${await resetToken(email)}?callbackURL=%2Freset-password`;
	await open(page, link);
	await expect(page).toHaveURL(/\/reset-password\?token=/);
	await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
	await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
	await page.getByRole("button", { name: "Reset password" }).click();
	await expect(page.getByText(/your password changed/i)).toBeVisible();

	await open(page, link);
	await expect(page.getByText(/expired or was already used/i)).toBeVisible();
	await page.getByRole("link", { name: "Back to sign in" }).click();

	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(NEW_PASSWORD);
	await page.getByRole("button", { name: "Sign In", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("a user changes the password on the profile page", async ({
	page,
	browser,
	extraHTTPHeaders,
}, testInfo) => {
	const email = await signUp(page);
	const other = await browser.newContext({
		baseURL: testInfo.project.use.baseURL,
		extraHTTPHeaders,
	});
	const otherPage = await other.newPage();
	expect(await signInStatus(otherPage, email, PASSWORD)).toBe(200);

	await open(page, "/profile");
	await page.getByLabel("Current password").fill(PASSWORD);
	await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
	await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
	await page.getByLabel("Sign out of other devices").check();
	await page.getByRole("button", { name: "Change password" }).click();
	await expect(page.getByText("Your password changed.")).toBeVisible();

	const otherSession = await otherPage.request.get("/api/auth/get-session");
	expect(await otherSession.json()).toBeNull();
	await other.close();
	await page.reload();
	await expect(page.getByLabel("Current password")).toBeVisible();
	await page.context().clearCookies();
	expect(await signInStatus(page, email, PASSWORD)).toBe(401);
	expect(await signInStatus(page, email, NEW_PASSWORD)).toBe(200);
});

test("the reset request has a limit of 3 per minute for each client", async ({
	page,
}) => {
	const statuses: number[] = [];
	for (let i = 0; i < 4; i++) {
		const response = await page.request.post(
			"/api/auth/request-password-reset",
			{
				data: {
					email: `nobody-${randomUUID()}@jottrade.test`,
					redirectTo: "/reset-password",
				},
			},
		);
		statuses.push(response.status());
	}
	expect(statuses).toEqual([200, 200, 200, 429]);
});
