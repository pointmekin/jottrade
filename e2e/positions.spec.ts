import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, open, SEED_PASSWORD, test } from "./support";

async function logTrade(
	page: Page,
	symbol: string,
	side: "Long" | "Short",
	price: string,
) {
	await open(page, "/journal");
	await page.getByRole("button", { name: "Log Trade" }).click();
	const form = page.getByRole("dialog", { name: "Log New Trade" });
	await form.getByRole("textbox", { name: "Symbol" }).fill(symbol);
	await form
		.getByRole("combobox", { name: "Side" })
		.selectOption({ label: side });
	await form
		.getByRole("textbox", { name: "Entry date" })
		.fill("2026-09-01T08:00");
	await form.getByRole("spinbutton", { name: "Entry price" }).fill(price);
	await form.getByRole("spinbutton", { name: /^Quantity/ }).fill("1");
	await form.getByRole("button", { name: `Log ${side}` }).click();
	await expect(form).toBeHidden();
	await page.getByRole("link", { name: new RegExp(symbol) }).click();
	await expect(page.getByRole("heading", { name: symbol })).toBeVisible();
}

async function addFill(
	page: Page,
	action: "Add entry" | "Close part",
	fill: { time: string; quantity: string; price: string },
) {
	await page.getByRole("button", { name: action }).click();
	const form = page.getByRole("dialog", { name: action });
	await form.getByLabel("Time").fill(fill.time);
	await form.getByLabel(/^Quantity/).fill(fill.quantity);
	await form.getByLabel("Price").fill(fill.price);
	await form.getByRole("button", { name: "Save fill" }).click();
	return form;
}

async function expectTotals(page: Page, open: string, realized: string) {
	const totals = page.getByLabel("Position totals");
	await expect(totals.getByRole("definition").nth(2)).toHaveText(open);
	await expect(totals.getByRole("definition").nth(7)).toHaveText(realized);
}

test("partial fills keep the open quantity and realized P&L, and the dashboard counts one closed trade", async ({
	page,
}) => {
	test.slow();
	// A new user, so the dashboard reads only the trades of this spec.
	const email = `positions-${randomUUID()}@jottrade.test`;
	const signUp = await page.request.post("/api/auth/sign-up/email", {
		data: { name: "Positions", email, password: SEED_PASSWORD },
	});
	expect(signUp.ok(), `sign up ${email}`).toBe(true);

	await logTrade(page, "EURUSD", "Long", "1.1");
	await expect(page.getByRole("region", { name: "Fills" })).toBeVisible();
	await expectTotals(page, "1.0 lots", "+$0.00");

	let form = await addFill(page, "Add entry", {
		time: "2026-09-01T09:00",
		quantity: "1",
		price: "1.095",
	});
	await expect(form).toBeHidden();
	await expectTotals(page, "2.0 lots", "+$0.00");

	form = await addFill(page, "Close part", {
		time: "2026-09-01T10:00",
		quantity: "2.5",
		price: "1.105",
	});
	await expect(form.getByRole("alert")).toHaveText(
		"This exit closes more than was open. You can close up to 2.",
	);
	await form.getByRole("button", { name: "Cancel" }).click();
	await expectTotals(page, "2.0 lots", "+$0.00");

	form = await addFill(page, "Close part", {
		time: "2026-09-01T10:00",
		quantity: "0.5",
		price: "1.105",
	});
	await expect(form).toBeHidden();
	await expectTotals(page, "1.5 lots", "+$375.00");

	await open(page, "/journal");
	await expect(page.getByRole("link", { name: /EURUSD/ })).toContainText(
		"Partly closed · 1.5 of 2.0 open",
	);
	await page.getByRole("link", { name: /EURUSD/ }).click();

	form = await addFill(page, "Close part", {
		time: "2026-09-01T11:00",
		quantity: "1.5",
		price: "1.1",
	});
	await expect(form).toBeHidden();
	await expectTotals(page, "0.0 lots", "+$750.00");

	await logTrade(page, "GBPUSD", "Short", "1.3");
	form = await addFill(page, "Close part", {
		time: "2026-09-01T10:00",
		quantity: "0.5",
		price: "1.295",
	});
	await expect(form).toBeHidden();
	await expectTotals(page, "0.5 lots", "+$250.00");

	await open(page, "/dashboard?period=all");
	await expect(
		page
			.getByRole("region", { name: "Account summary" })
			.getByText("Across 1 trades"),
	).toBeVisible();
});
