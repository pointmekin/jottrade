import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { RULES_DISCLAIMER } from "../src/lib/risk-rules";
import { expect, open, SEED_PASSWORD, test } from "./support";

// The browser runs in UTC, so this is the wall time of the entry input.
const inMinutes = (minutes: number) =>
	new Date(Date.now() + minutes * 60_000).toISOString().slice(0, 16);

async function logTrade(page: Page, symbol: string, entryDate: string) {
	await page.getByRole("button", { name: "Log Trade" }).click();
	const form = page.getByRole("dialog", { name: "Log New Trade" });
	await form.getByRole("textbox", { name: "Symbol" }).fill(symbol);
	await form.getByRole("textbox", { name: "Entry date" }).fill(entryDate);
	await form.getByRole("spinbutton", { name: "Entry price" }).fill("100");
	await form.getByRole("spinbutton", { name: /^Quantity/ }).fill("1");
	await form.getByRole("button", { name: "Log Long" }).click();
	await expect(form).toBeHidden();
}

test("the dashboard shows the trades left today and links a violation to its trade", async ({
	page,
}) => {
	// Sign-up, settings, two trades and the dashboard take longer than one default test.
	test.slow();
	// A new user, so no other spec reads or writes these rules or trades.
	const email = `rules-dashboard-${randomUUID()}@jottrade.test`;
	const signUp = await page.request.post("/api/auth/sign-up/email", {
		data: { name: "Rules Dashboard", email, password: SEED_PASSWORD },
	});
	expect(signUp.ok(), `sign up ${email}`).toBe(true);

	await open(page, "/settings");
	await page.getByLabel("IANA timezone").fill("UTC");
	await page.getByRole("button", { name: "Save review preferences" }).click();
	await page.getByLabel("Max trades per day").fill("1");
	await page.getByRole("button", { name: "Save rules" }).click();
	await expect(page.getByText(/^Version 1 · since/)).toBeVisible();

	await open(page, "/journal");
	await logTrade(page, "RULEONE", inMinutes(2));
	await logTrade(page, "RULETWO", inMinutes(3));

	await open(page, "/dashboard");
	const today = page.getByRole("region", { name: "Rules today" });
	await expect(today).toContainText("Trades left0 of 1");
	await expect(today).toContainText("2 trades entered today");
	await expect(today).toContainText("UTC · Rules v1");
	await expect(today.getByRole("note")).toHaveText(RULES_DISCLAIMER);

	const compliance = page.getByRole("region", { name: "Rule compliance" });
	await expect(compliance).toContainText(
		"Trades per day: 1 day checked · 0 pass · 1 violated · 0 unknown",
	);
	const violation = compliance
		.getByRole("list", { name: "Rule violations" })
		.getByRole("listitem");
	await expect(violation).toHaveCount(1);
	await expect(violation).toContainText("Trades per day: 2 of 1");

	await page.setViewportSize({ width: 375, height: 812 });
	const source = violation.getByRole("link", { name: /^Open trade #/ });
	await source.scrollIntoViewIfNeeded();
	const box = await source.boundingBox();
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	await source.click();
	await expect(page.getByRole("heading", { name: "RULETWO" })).toBeVisible();
});
