import type { Page } from "@playwright/test";
import { expect, money, open, SeedUser, signIn, test } from "./support";

// Bob Main (scripts/db/seed-trades.ts): SPY closed on 10 Feb 2026 (+15.80),
// QQQ closed on 11 Feb 2026 (-19.00). No spec writes Bob's data.
const SPY_PNL = 15.8;
const FEBRUARY = "period=custom&dateFrom=2026-02-01&dateTo=2026-02-28";

async function goTo(page: Page, title: string) {
	await page.getByRole("link", { name: title, exact: true }).first().click();
	await expect(page).toHaveURL(new RegExp(`/${title.toLowerCase()}\\?`));
}

async function expectDashboardScope(page: Page) {
	await expect(page).toHaveURL(/symbol=SPY/);
	await expect(
		page.getByText("Filtered: trading performance only"),
	).toBeVisible();
	const summary = page.getByRole("region", { name: "Account summary" });
	await expect(summary.getByText("Across 1 trades")).toBeVisible();
	const netPnl = await summary
		.getByText(/^[+-]\$[\d,.]+$/)
		.first()
		.textContent();
	expect(money(netPnl ?? "")).toBeCloseTo(SPY_PNL, 2);
}

test("one scope from the journal gives the same totals on the dashboard and the calendar", async ({
	page,
}) => {
	await signIn(page, SeedUser.Bob);
	await open(page, `/journal?${FEBRUARY}`);
	await page.getByRole("button", { name: /Filters/ }).click();
	await page.getByRole("textbox", { name: "Symbol" }).fill("SPY");
	await expect(page).toHaveURL(/symbol=SPY/);
	await expect(
		page.getByText("Closed or opened in: Feb 1, 2026"),
	).toBeVisible();
	await expect(page.getByText("1 closed · net P&L +$15.80")).toBeVisible();

	await goTo(page, "Dashboard");
	await expectDashboardScope(page);
	await page.reload({ waitUntil: "domcontentloaded" });
	await expectDashboardScope(page);

	await goTo(page, "Calendar");
	await expect(page).toHaveURL(/symbol=SPY/);
	const calendar = new URL(page.url());
	calendar.searchParams.set("year", "2026");
	calendar.searchParams.set("month", "2");
	await open(page, `${calendar.pathname}${calendar.search}`);
	const days = page.getByRole("button", { name: /net P&L/ });
	await expect(days).toHaveCount(1);
	// "Tuesday, February 10, 2026, 1 trade, net P&L +$16"; cells round to whole units.
	const label = (await days.first().getAttribute("aria-label")) ?? "";
	const [trades, pnl] = label.split(", ").slice(-2);
	expect(Number.parseInt(trades, 10)).toBe(1);
	expect(Math.abs(money(pnl) - SPY_PNL)).toBeLessThanOrEqual(1);
});

test("a page above the last page recovers to the last page", async ({
	page,
}) => {
	await signIn(page, SeedUser.Bob);
	await open(page, "/journal?symbol=SPY&page=99");
	await expect(page).toHaveURL(/page=1(&|$)/);
	await expect(page.getByText("SPY").first()).toBeVisible();
});
