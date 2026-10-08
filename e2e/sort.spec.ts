import { expect, open, SeedUser, signIn, test } from "./support";

// Sam Main (scripts/db/seed-trades.ts): 55 trades. NFLX (+$500.00) is the
// oldest, so the default newest-first order shows it on page 2. No spec
// writes Sam's data.
test("a sort by net P&L brings the largest trade from page 2 to page 1", async ({
	page,
}) => {
	await signIn(page, SeedUser.Sam);
	await open(page, "/journal?page=2");
	const table = page.getByRole("table");
	await expect(table.getByText("NFLX")).toBeVisible();

	await page.getByRole("button", { name: "Sort by net P&L" }).click();

	await expect(page).toHaveURL(/sort=netPnl/);
	await expect(page).toHaveURL(/page=1(&|$)/);
	await expect(
		page.getByRole("columnheader", { name: /Net P&L/ }),
	).toHaveAttribute("aria-sort", "descending");
	const firstTrade = table.getByRole("link").first();
	await expect(firstTrade).toContainText("NFLX");
	await expect(firstTrade).toContainText("+$500.00");
});
