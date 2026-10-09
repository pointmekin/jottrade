import { expect, open, SeedUser, signIn, test } from "./support";

const SYMBOL = "E2ECRUD";
const STRATEGY = "E2E Breakout";
const CRITERION = "Price closes above the range high.";

test("create with a strategy, edit and delete a trade, with each change kept after a reload", async ({
	page,
}) => {
	await signIn(page, SeedUser.Erin);
	await open(page, "/strategies");
	await page.getByRole("button", { name: "New Strategy" }).click();
	await page.getByPlaceholder("e.g. Breakout").fill(STRATEGY);
	await page
		.getByRole("group", { name: "Entry criteria" })
		.getByRole("button", { name: "Add criterion" })
		.click();
	await page
		.getByRole("textbox", { name: "Entry criterion 1" })
		.fill(CRITERION);
	await page.getByRole("button", { name: "Create Strategy" }).click();
	await expect(page.getByText("Saved.")).toBeVisible();

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
	await form
		.getByRole("combobox", { name: "Strategy" })
		.selectOption({ label: STRATEGY });
	await form.getByRole("button", { name: "Show playbook" }).click();
	await expect(form.getByText(CRITERION)).toBeVisible();
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
	await expect(
		page.getByRole("group", { name: "Strategy" }).getByRole("combobox"),
	).toHaveText(STRATEGY);
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
