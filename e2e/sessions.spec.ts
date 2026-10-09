import { randomUUID } from "node:crypto";
import { expect, open, test } from "./support";

const PASSWORD = "jottrade-dev-password";

test("a user signs out another device from the profile page", async ({
	page,
	browser,
	extraHTTPHeaders,
}, testInfo) => {
	// A new user, so the revocation never affects a seed user's sessions.
	const email = `sessions-${randomUUID()}@jottrade.test`;
	const signUp = await page.request.post("/api/auth/sign-up/email", {
		data: { name: "Session Fixture", email, password: PASSWORD },
	});
	expect(signUp.ok(), `sign up ${email}`).toBe(true);

	const other = await browser.newContext({
		baseURL: testInfo.project.use.baseURL,
		extraHTTPHeaders,
	});
	const otherPage = await other.newPage();
	const signIn = await otherPage.request.post("/api/auth/sign-in/email", {
		data: { email, password: PASSWORD },
	});
	expect(signIn.ok(), `sign in ${email}`).toBe(true);
	await open(otherPage, "/dashboard");
	await expect(
		otherPage.getByRole("heading", { name: "Dashboard" }),
	).toBeVisible();

	await open(page, "/profile");
	const sessions = page.getByRole("list", { name: "Sessions" });
	await expect(sessions.getByRole("listitem")).toHaveCount(2);
	await sessions
		.getByRole("listitem")
		.filter({ hasNotText: "This device" })
		.getByRole("button", { name: "Sign out" })
		.click();
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Sign out" })
		.click();
	await expect(page.getByText("The device is signed out.")).toBeVisible();
	await expect(sessions.getByRole("listitem")).toHaveCount(1);
	await expect(sessions.getByRole("listitem")).toContainText("This device");

	await open(otherPage, "/journal");
	await expect(otherPage).toHaveURL(/\/sign-in/);
	await other.close();

	await page.reload();
	await expect(sessions.getByRole("listitem")).toHaveCount(1);
});
