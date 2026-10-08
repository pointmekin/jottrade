import { expect, open, SeedUser, signIn, test } from "./support";

test("a new user sets up the account from the checklist and keeps the progress", async ({
	page,
}) => {
	await signIn(page, SeedUser.Nora);
	await open(page, "/dashboard");
	const checklist = page.getByRole("region", {
		name: "Get to your first review",
	});
	await expect(checklist).toContainText("0 of 4 steps done");

	const setUp = checklist.getByRole("button", { name: "Set up account" });
	const dialog = page.getByRole("dialog", {
		name: "Set up your trading account",
	});
	await setUp.focus();
	await page.keyboard.press("Enter");
	await expect(dialog).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(setUp).toBeFocused();

	await setUp.click();
	await dialog
		.getByRole("textbox", { name: "Account name" })
		.fill("Exness Standard");
	await dialog.getByRole("button", { name: "Save account" }).click();

	await expect(dialog).toBeHidden();
	await expect(checklist).toContainText("1 of 4 steps done");

	await page.reload();
	await expect(checklist).toContainText("1 of 4 steps done");
});
