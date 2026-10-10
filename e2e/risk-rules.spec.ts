import { randomUUID } from "node:crypto";
import { RULES_DISCLAIMER } from "../src/lib/risk-rules";
import { expect, open, SEED_PASSWORD, test } from "./support";

test.use({ viewport: { width: 375, height: 812 } });

test("a user saves two rule versions on a phone, and they stay after a reload", async ({
	page,
}) => {
	// A new user, so no other spec reads or writes these rules.
	const email = `rules-${randomUUID()}@jottrade.test`;
	const signUp = await page.request.post("/api/auth/sign-up/email", {
		data: { name: "Rules Fixture", email, password: SEED_PASSWORD },
	});
	expect(signUp.ok(), `sign up ${email}`).toBe(true);

	await open(page, "/settings");
	await expect(
		page.getByText("Choose your review timezone first."),
	).toBeVisible();
	await page.getByLabel("IANA timezone").fill("UTC");
	await page.getByRole("button", { name: "Save review preferences" }).click();

	const tradesPerDay = page.getByLabel("Max trades per day");
	const dailyLoss = page.getByLabel("Daily loss limit");
	const save = page.getByRole("button", { name: "Save rules" });
	await tradesPerDay.fill("3");
	await save.click();
	await expect(page.getByText(/^Version 1 · since/)).toBeVisible();

	await dailyLoss.fill("500");
	await save.click();
	await expect(page.getByText(/^Version 2 · since/)).toBeVisible();
	await expect(page.getByText(/days end at midnight UTC$/)).toBeVisible();

	await page.reload();
	await expect(page.getByText(/^Version 2 · since/)).toBeVisible();
	await expect(tradesPerDay).toHaveValue("3");
	await expect(dailyLoss).toHaveValue("500");
	const disclaimer = page.getByRole("note");
	await disclaimer.scrollIntoViewIfNeeded();
	await expect(disclaimer).toHaveText(RULES_DISCLAIMER);
	await expect(disclaimer).toBeInViewport();
});
