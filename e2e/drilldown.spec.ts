import type { Locator } from "@playwright/test";
import { expect, open, SeedUser, signIn, test } from "./support";

// Alice Main USD (scripts/db/seed-trades.ts) has closed trades for Breakout,
// Mean Reversion and no strategy. No spec writes Alice's trades.
async function barCount(bar: Locator) {
	const label = (await bar.getAttribute("aria-label")) ?? "";
	return Number(/^Open (\d+) /.exec(label)?.[1]);
}

test("a strategy or symbol bar opens the same closed trades in the journal", async ({
	page,
}) => {
	await signIn(page, SeedUser.Alice);
	await open(page, "/dashboard?period=all");

	const strategyBar = page.getByRole("link", {
		name: /^Open \d+ Breakout trades$/,
	});
	const strategyCount = await barCount(strategyBar);
	expect(strategyCount).toBeGreaterThan(1);
	await strategyBar.click();
	await expect(page).toHaveURL(/\/journal\?.*setupId=/);
	await expect(page).toHaveURL(/status=CLOSED/);
	await expect(page.getByText("Strategy: Breakout")).toBeVisible();
	await expect(
		page.getByText(new RegExp(`· ${strategyCount} closed · net P&L`)),
	).toBeVisible();

	await open(page, "/dashboard?period=all");
	const symbolBar = page.getByRole("link", { name: /^Open \d+ AAPL trades$/ });
	const symbolCount = await barCount(symbolBar);
	await symbolBar.focus();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/symbol=AAPL/);
	await expect(page).toHaveURL(/symbolMatch=exact/);
	await expect(page.getByText("Symbol is AAPL")).toBeVisible();
	await expect(
		page.getByText(new RegExp(`· ${symbolCount} closed · net P&L`)),
	).toBeVisible();
});
