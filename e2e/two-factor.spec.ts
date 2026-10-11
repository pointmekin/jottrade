import { randomUUID } from "node:crypto";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { expect, open, test } from "./support";

const PASSWORD = "jottrade-two-factor-password";

function totpCode(setupKey: string) {
	return createOTP(new TextDecoder().decode(base32.decode(setupKey))).totp();
}

test("a user turns on two-factor, signs in with a recovery code and turns it off", async ({
	page,
}) => {
	const email = `two-factor-${randomUUID()}@jottrade.test`;
	const response = await page.request.post("/api/auth/sign-up/email", {
		data: { name: "Two-Factor Fixture", email, password: PASSWORD },
	});
	expect(response.ok(), `sign up ${email}`).toBe(true);

	await open(page, "/profile");
	await page.getByLabel("Confirm with your password").fill(PASSWORD);
	await page.getByRole("button", { name: "Set up two-factor" }).click();
	const setupKey = await page.getByLabel("Setup key").inputValue();
	const codes = await page
		.getByRole("list", { name: "Recovery codes" })
		.getByRole("listitem")
		.allInnerTexts();
	expect(codes).toHaveLength(10);
	await page.getByLabel("Code from the app").fill(await totpCode(setupKey));
	await page.getByRole("button", { name: "Turn on" }).click();
	await expect(
		page.getByText("Two-factor authentication is on."),
	).toBeVisible();

	await page.context().clearCookies();
	await open(page, "/sign-in");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(PASSWORD);
	await page.getByRole("button", { name: "Sign In", exact: true }).click();
	await expect(page).toHaveURL(/\/two-factor$/);
	await page.getByRole("button", { name: "Use a recovery code" }).click();
	await page.getByLabel("Recovery code").fill(codes[0]);
	await page.getByRole("button", { name: "Verify" }).click();
	await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

	await open(page, "/profile");
	await page.getByLabel("Confirm with your password").fill(PASSWORD);
	await page.getByRole("button", { name: "Turn off" }).click();
	await expect(
		page.getByText("Two-factor authentication is off."),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Set up two-factor" }),
	).toBeVisible();
});
