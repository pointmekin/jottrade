import { expect, open, SeedUser, signIn, test } from "./support";

for (const width of [1280, 375]) {
	test.describe(`risk capture at ${width}px`, () => {
		test.use({ viewport: { width, height: 812 } });

		test("explains invalid optional inputs and saves the corrected draft by keyboard", async ({
			page,
		}) => {
			const symbol = `RISK${width}`;
			await signIn(page, SeedUser.Erin);
			await open(page, "/journal");
			await page.getByRole("button", { name: "Log Trade" }).click();
			const form = page.getByRole("dialog", { name: "Log New Trade" });
			await form.getByLabel("Symbol", { exact: true }).fill(symbol);
			await form.getByLabel("Entry price", { exact: true }).fill("100");
			await form.getByLabel("Quantity (units)").fill("2");
			await form.getByLabel("Notes", { exact: true }).fill("Keep this draft.");
			const fields = [
				["Initial stop price", "bad", "90", "Enter a positive decimal number."],
				[
					"Entry FX rate (account money per quote unit)",
					"bad",
					"1",
					"Enter a positive decimal number.",
				],
				["Balance used for risk %", "bad", "", "Balance must be nonnegative."],
				[
					"Confirm unit-based quantity: quote currency",
					"US1",
					"USD",
					"Enter a three-letter quote currency, e.g. USD, or leave blank.",
				],
			] as const;
			for (const [label, invalid] of fields)
				await form.getByLabel(label, { exact: true }).fill(invalid);
			const submit = form.getByRole("button", { name: "Log Long" });
			await submit.focus();
			await page.keyboard.press("Enter");
			for (const [label, , valid, message] of fields) {
				const input = form.getByLabel(label, { exact: true });
				await expect(input).toBeFocused();
				await expect(input).toBeInViewport();
				await expect(input).toHaveAttribute("aria-invalid", "true");
				await expect(input).toHaveAccessibleDescription(
					new RegExp(message.replaceAll(".", "\\.")),
				);
				await input.fill(valid);
				await page.keyboard.press("Tab");
				await expect(input).not.toBeFocused();
				await expect(form.getByLabel("Notes", { exact: true })).toHaveValue(
					"Keep this draft.",
				);
				await submit.focus();
				await page.keyboard.press("Enter");
			}
			await expect(form).toBeHidden();
			await page.reload();
			await page.getByRole("link", { name: new RegExp(symbol) }).click();
			await expect(page.getByRole("heading", { name: symbol })).toBeVisible();
			await expect(
				page.getByText("Keep this draft.", { exact: true }),
			).toBeVisible();
			await page.getByRole("button", { name: "Delete trade" }).click();
			await page
				.getByRole("alertdialog", { name: "Delete trade?" })
				.getByRole("button", { name: "Delete permanently" })
				.click();
			await expect(page).toHaveURL(/\/journal(\?|$)/);
		});
	});
}
