import { randomUUID } from "node:crypto";
import { expect, open, SEED_PASSWORD, test } from "./support";

const VIOLATED = "Trades per day: 4 of 3 · Violated";
const NOTE = "Planned breakout before the open.";

test.use({ viewport: { width: 375, height: 812 } });

test("the 4th trade over a 3 trades per day rule shows Violated in both paths, the trade keeps the check and the note, and the daily review links the violation", async ({
	page,
}) => {
	// Settings, five forms, the trade page and the review take longer than one default test.
	test.slow();
	// A new user, so no other spec reads or writes these trades.
	const email = `rule-check-${randomUUID()}@jottrade.test`;
	const signUp = await page.request.post("/api/auth/sign-up/email", {
		data: { name: "Rule Check Fixture", email, password: SEED_PASSWORD },
	});
	expect(signUp.ok(), `sign up ${email}`).toBe(true);

	await open(page, "/settings");
	await page.getByLabel("IANA timezone").fill("UTC");
	await page.getByRole("button", { name: "Save review preferences" }).click();
	await page.getByLabel("Max trades per day").fill("3");
	await page.getByRole("button", { name: "Save rules" }).click();
	await expect(page.getByText(/^Version 1 · since/)).toBeVisible();

	await open(page, "/journal");
	const form = page.getByRole("dialog", { name: "Log New Trade" });
	const fillForm = async (symbol: string) => {
		await page.getByRole("button", { name: "Log Trade" }).click();
		await form.getByRole("textbox", { name: "Symbol" }).fill(symbol);
		await form.getByRole("spinbutton", { name: "Entry price" }).fill("100");
		await form.getByRole("spinbutton", { name: "Quantity (units)" }).fill("1");
	};
	for (const symbol of ["RULEA", "RULEB", "RULEC"]) {
		await fillForm(symbol);
		await expect(
			form.getByRole("region", { name: "Rule check" }),
		).not.toContainText("Violated");
		await form.getByRole("button", { name: "Log Long" }).click();
		await expect(form).toBeHidden();
	}

	await fillForm("RULED");
	await expect(form.getByRole("region", { name: "Rule check" })).toContainText(
		VIOLATED,
	);
	await expect(
		form.getByRole("textbox", { name: "Why did you take it? (optional)" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(form).toBeHidden();

	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("combobox").fill("long gold");
	await page.getByRole("option", { name: /Log long XAUUSDM/ }).click();
	const palette = page.getByRole("dialog");
	await palette.getByLabel("Entry price").fill("2000");
	await palette.getByLabel("Quantity (lots)").fill("0.01");
	await expect(
		palette.getByRole("region", { name: "Rule check" }),
	).toContainText(VIOLATED);
	await palette.getByLabel("Why did you take it? (optional)").fill(NOTE);
	await palette.getByRole("button", { name: "Confirm and save" }).click();
	await expect(page.getByText("Trade logged")).toBeVisible();

	await page.reload();
	await page.getByRole("link", { name: /XAUUSDM/ }).click();
	const stored = page.getByRole("region", { name: "Rule check at entry" });
	await stored.scrollIntoViewIfNeeded();
	await expect(stored).toContainText(VIOLATED);
	await expect(stored).toContainText(NOTE);
	await expect(stored).toContainText(/Rules v1 · .+, UTC/);
	await expect(stored).not.toContainText("Now:");
	const tradeUrl = page.url();

	await open(page, "/reviews");
	const violations = page.getByRole("region", { name: "Rule violations" });
	await expect(violations).toContainText("Rule violations this day (1)");
	await expect(violations).toContainText("Trades per day: 4 of 3");
	const source = violations.getByRole("link", { name: /^Open trade #/ });
	await source.scrollIntoViewIfNeeded();
	const box = await source.boundingBox();
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	await source.click();
	await expect(page).toHaveURL(tradeUrl);
});
