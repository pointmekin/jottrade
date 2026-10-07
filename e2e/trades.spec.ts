import { expect, open, SeedUser, signIn, test } from "./support";

const SYMBOL = "E2ECRUD";

test("create, edit and delete a trade, with each change kept after a reload", async ({
	page,
}) => {
	await signIn(page, SeedUser.Erin);
	await open(page, "/journal");
	const row = page.getByRole("link", { name: new RegExp(SYMBOL) });

	await page.getByRole("button", { name: "Log Trade" }).click();
	const form = page.getByRole("dialog", { name: "Log New Trade" });
	await form.getByRole("textbox", { name: "Symbol" }).fill(SYMBOL);
	await form
		.getByRole("textbox", { name: "Entry date" })
		.fill("2026-09-01T08:00");
	await form.getByRole("spinbutton", { name: "Entry price" }).fill("100");
	await form.getByRole("spinbutton", { name: "Quantity (units)" }).fill("2");
	await form.getByRole("spinbutton", { name: "Exit price" }).fill("110");
	await form
		.getByRole("textbox", { name: "Exit date" })
		.fill("2026-09-01T12:00");
	await form.getByRole("button", { name: "Log Long" }).click();

	await expect(form).toBeHidden();
	await page.reload();
	await expect(row).toContainText("+$20.00");

	await row.click();
	await expect(page.getByRole("heading", { name: SYMBOL })).toBeVisible();
	const exitPrice = page
		.getByRole("group", { name: "Exit Price" })
		.getByRole("textbox");
	await exitPrice.fill("115");
	await page.getByRole("button", { name: "Save Changes" }).click();
	await expect(page.getByText("+$30.00 net P&L")).toBeVisible();

	await page.reload();
	await expect(exitPrice).toHaveValue("115");
	await expect(page.getByText("+$30.00 net P&L")).toBeVisible();

	await page.getByRole("button", { name: "Delete trade" }).click();
	const confirm = page.getByRole("alertdialog", { name: "Delete trade?" });
	await confirm.getByRole("button", { name: "Delete permanently" }).click();
	await expect(page).toHaveURL(/\/journal(\?|$)/);
	await page.reload();
	await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();
	await expect(row).toHaveCount(0);
});
