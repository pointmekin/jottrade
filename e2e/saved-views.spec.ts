import { expect, money, open, SeedUser, signIn, test } from "./support";

// Bob Main (scripts/db/seed-trades.ts): SPY closed on 10 Feb 2026 (+15.80).
// No other spec writes Bob's data or his saved views.
const SCOPE = "period=custom&dateFrom=2026-02-01&dateTo=2026-02-28&symbol=SPY";

test("a saved view survives a reload, opens its account and gives the dashboard the journal totals", async ({
	page,
}) => {
	const name = `Feb SPY ${Date.now()}`;
	await signIn(page, SeedUser.Bob);
	await open(page, `/journal?${SCOPE}`);
	await expect(page.getByText("1 closed · net P&L +$15.80")).toBeVisible();

	await page.getByRole("button", { name: "Views", exact: true }).click();
	await page.getByRole("menuitem", { name: "Save current as…" }).click();
	await page.getByLabel("Name").fill(name);
	await page.getByLabel("Always open in Bob Main").check();
	await page.getByRole("button", { name: "Save view" }).click();
	await expect(page.getByText(`View: ${name}`)).toBeVisible();

	await open(page, "/journal");
	await page.getByRole("button", { name: /Bob Main/ }).click();
	await page.getByRole("menuitem", { name: /^Bob Crypto/ }).click();
	await expect(page.getByRole("button", { name: /Bob Crypto/ })).toBeVisible();
	await page.getByRole("button", { name: "Views", exact: true }).click();
	await page.getByRole("menuitem", { name: new RegExp(name) }).click();

	await expect(page).toHaveURL(/symbol=SPY/);
	await expect(page.getByRole("button", { name: /Bob Main/ })).toBeVisible();
	await expect(page.getByText(`View: ${name}`)).toBeVisible();
	const header = page.getByText("closed · net P&L");
	await expect(header).toContainText("1 closed");
	// "3 trades · 1 closed · net P&L +$15.80 · 0 adjustments · Feb 1, 2026 – Feb 28, 2026"
	const parts = ((await header.textContent()) ?? "").split(" · ");
	const count = Number.parseInt(parts[1], 10);
	const netPnl = money(parts[2]);

	await page
		.getByRole("link", { name: "Dashboard", exact: true })
		.first()
		.click();
	await expect(page).toHaveURL(/\/dashboard\?.*savedView=/);
	const summary = page.getByRole("region", { name: "Account summary" });
	await expect(summary.getByText(`Across ${count} trades`)).toBeVisible();
	const dashboardPnl = await summary
		.getByText(/^[+-]\$[\d,.]+$/)
		.first()
		.textContent();
	expect(money(dashboardPnl ?? "")).toBeCloseTo(netPnl, 2);

	await page.getByRole("button", { name: "Views", exact: true }).click();
	await page.getByRole("menuitem", { name: `Delete “${name}”…` }).click();
	await page.getByRole("button", { name: "Delete view" }).click();
	await expect(page.getByText(`View: ${name}`)).toHaveCount(0);
});
