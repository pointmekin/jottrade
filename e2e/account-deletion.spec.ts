import { randomUUID } from "node:crypto";
import { expect, open, test } from "./support";

const PASSWORD = "jottrade-dev-password";
const SYMBOL = "E2EDELETE";

test("a user deletes the account with the password and cannot sign in again", async ({
	page,
}) => {
	// A new user, so the deletion never affects a seed user.
	const email = `deletion-${randomUUID()}@jottrade.test`;
	const signUp = await page.request.post("/api/auth/sign-up/email", {
		data: { name: "Deletion Fixture", email, password: PASSWORD },
	});
	expect(signUp.ok(), `sign up ${email}`).toBe(true);

	await open(page, "/journal");
	await page.getByRole("button", { name: "Log Trade" }).click();
	const form = page.getByRole("dialog", { name: "Log New Trade" });
	await form.getByRole("textbox", { name: "Symbol" }).fill(SYMBOL);
	await form
		.getByRole("textbox", { name: "Entry date" })
		.fill("2026-09-01T08:00");
	await form.getByRole("spinbutton", { name: "Entry price" }).fill("100");
	await form.getByRole("spinbutton", { name: "Quantity (units)" }).fill("1");
	await form.getByRole("button", { name: "Log Long" }).click();
	await expect(form).toBeHidden();
	await expect(
		page.getByRole("link", { name: new RegExp(SYMBOL) }),
	).toBeVisible();

	await open(page, "/profile");
	await page.getByRole("button", { name: "Delete account" }).click();
	const dialog = page.getByRole("alertdialog", {
		name: "Delete your account?",
	});
	await expect(dialog).toContainText("You cannot undo this.");
	await expect(
		dialog.getByRole("link", { name: "download your archive" }),
	).toHaveAttribute("href", "/settings");
	const confirm = dialog.getByRole("button", { name: "Delete account" });
	await expect(confirm).toBeDisabled();
	await dialog.getByLabel("Current password").fill(PASSWORD);
	await page.keyboard.press("Enter");

	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByText("Your account was deleted.")).toBeVisible();
	const session = await page.request.get("/api/auth/get-session");
	expect(await session.json()).toBeNull();
	const signIn = await page.request.post("/api/auth/sign-in/email", {
		data: { email, password: PASSWORD },
	});
	expect(signIn.status()).toBe(401);
});

test("the delete request has a limit of 5 per minute for each client", async ({
	page,
}, testInfo) => {
	const email = `deletion-${randomUUID()}@jottrade.test`;
	const signUp = await page.request.post("/api/auth/sign-up/email", {
		data: { name: "Deletion Fixture", email, password: PASSWORD },
	});
	expect(signUp.ok(), `sign up ${email}`).toBe(true);

	const statuses: number[] = [];
	for (let i = 0; i < 6; i++) {
		const response = await page.request.post("/api/auth/delete-user", {
			data: { password: "wrong-password" },
			headers: { origin: String(testInfo.project.use.baseURL) },
		});
		statuses.push(response.status());
	}
	expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
});
