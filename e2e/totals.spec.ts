import { expect, money, open, SeedUser, signIn, test } from "./support";

// Bob Main (scripts/db/seed-trades.ts) has two closed trades in February 2026:
// SPY with the Breakout strategy (+15.80) and QQQ without a strategy (-19.00).
const BREAKOUT_PNL = 15.8;
const UNASSIGNED_PNL = -19;

test("dashboard, calendar and strategy totals agree for one account", async ({
	page,
}) => {
	await signIn(page, SeedUser.Bob);

	await open(page, "/dashboard?period=all");
	const summary = page.getByRole("region", { name: "Account summary" });
	await expect(summary.getByText("Across 2 trades")).toBeVisible();
	const netPnl = money(
		(await summary
			.getByText(/^[+-]\$[\d,.]+$/)
			.first()
			.textContent()) ?? "",
	);
	expect(netPnl).toBeCloseTo(BREAKOUT_PNL + UNASSIGNED_PNL, 2);

	await open(page, "/calendar?year=2026&month=2");
	const days = page.getByRole("button", { name: /net P&L/ });
	await expect(days).toHaveCount(2);
	const labels = await days.evaluateAll((cells) =>
		cells.map((cell) => cell.getAttribute("aria-label") ?? ""),
	);
	// "Tuesday, February 10, 2026, 1 trade, net P&L +$16"
	const parts = labels.map((label) => label.split(", ").slice(-2));
	const dayTrades = parts.map(([trades]) => Number.parseInt(trades, 10));
	const dayPnl = parts.map(([, pnl]) => money(pnl));
	expect(dayTrades.reduce((sum, count) => sum + count, 0)).toBe(2);
	// Calendar cells round to whole units.
	expect(
		Math.abs(dayPnl.reduce((sum, pnl) => sum + pnl, 0) - netPnl),
	).toBeLessThanOrEqual(1);

	await open(page, "/strategies");
	await page.getByRole("button", { name: /^Breakout/ }).click();
	const performance = page.getByRole("region", {
		name: "Strategy performance",
	});
	await expect(performance).toContainText("Bob Main");
	// Avg P&L and Total P&L of one closed trade, in the cards and in the "Not checked" bucket.
	await expect(performance.getByText("+$15.80", { exact: true })).toHaveCount(
		4,
	);

	const adherence = performance.getByRole("region", { name: "Plan adherence" });
	await expect(
		adherence.getByRole("listitem", { name: "Followed" }),
	).toContainText("No trades");
	await adherence.getByRole("link", { name: "Open 1 trade" }).click();
	await expect(page).toHaveURL(/adherence=unchecked/);
	await expect(page.getByText("Plan: Not checked")).toBeVisible();
	await expect(page.getByText(/· 1 closed · net P&L \+\$15\.80/)).toBeVisible();
});
