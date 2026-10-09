import { expect, open, SeedUser, signIn, test } from "./support";

const SYMBOL = "E2EPLAY";
const STRATEGY = "E2E Playbook";
const OLD_RULE = "Price holds the prior day high.";
const NEW_RULE = "Price closes above the prior day high.";

test("a playbook check stays after a reload and keeps its text after a playbook edit", async ({
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
	const criterion = page.getByRole("textbox", { name: "Entry criterion 1" });
	await criterion.fill(OLD_RULE);
	await page.getByRole("button", { name: "Create Strategy" }).click();
	await expect(page.getByText("Saved.")).toBeVisible();

	await open(page, "/journal");
	await page.getByRole("button", { name: "Log Trade" }).click();
	const form = page.getByRole("dialog", { name: "Log New Trade" });
	await form.getByRole("textbox", { name: "Symbol" }).fill(SYMBOL);
	await form
		.getByRole("textbox", { name: "Entry date" })
		.fill("2026-09-02T08:00");
	await form.getByRole("spinbutton", { name: "Entry price" }).fill("100");
	await form.getByRole("spinbutton", { name: "Quantity (units)" }).fill("1");
	await form
		.getByRole("combobox", { name: "Strategy" })
		.selectOption({ label: STRATEGY });
	await form.getByRole("button", { name: "Log Long" }).click();
	await expect(form).toBeHidden();
	await page.getByRole("link", { name: new RegExp(SYMBOL) }).click();
	await expect(page.getByRole("heading", { name: SYMBOL })).toBeVisible();
	const tradeUrl = page.url();

	const check = page.getByRole("region", { name: "Playbook check" });
	await check
		.getByRole("radiogroup", { name: OLD_RULE })
		.getByText("Followed")
		.click();
	await check.getByRole("button", { name: "Save check" }).click();
	await expect(check.getByText("Followed plan")).toBeVisible();
	await page.reload();
	await expect(check.getByText("Followed plan")).toBeVisible();
	await expect(check.getByText(/1 of 1 followed/)).toBeVisible();

	await open(page, "/strategies");
	await page.getByRole("button", { name: STRATEGY }).click();
	await criterion.fill(NEW_RULE);
	await page.getByRole("button", { name: "Save Changes" }).click();
	await expect(page.getByText("Saved.")).toBeVisible();

	await open(page, tradeUrl);
	await expect(
		check.getByText(`Checked against ${STRATEGY} v1. The playbook is now v2.`),
	).toBeVisible();
	await expect(check.getByText(OLD_RULE)).toBeVisible();
	await expect(check.getByText(NEW_RULE)).toHaveCount(0);
});
