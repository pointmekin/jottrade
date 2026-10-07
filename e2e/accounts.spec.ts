import { expect, open, SeedUser, signIn, test } from "./support";

test("switching the account changes the journal and stays after a reload", async ({
	page,
}) => {
	await signIn(page, SeedUser.Alice);
	await open(page, "/journal");
	const switcher = page.getByRole("button", { name: /Main USD/ });
	await expect(switcher).toBeVisible();
	await expect(page.getByRole("link", { name: /AAPL/ }).first()).toBeVisible();

	await switcher.click();
	await page.getByRole("menuitem", { name: "EUR Swing Real" }).click();

	await expect(page.getByRole("button", { name: /EUR Swing/ })).toBeVisible();
	await expect(
		page.getByRole("link", { name: /EURGBP/ }).first(),
	).toBeVisible();
	await expect(page.getByRole("link", { name: /AAPL/ })).toHaveCount(0);

	await page.reload();
	await expect(page.getByRole("button", { name: /EUR Swing/ })).toBeVisible();
	await expect(
		page.getByRole("link", { name: /EURGBP/ }).first(),
	).toBeVisible();
	await expect(page.getByRole("link", { name: /AAPL/ })).toHaveCount(0);
});
