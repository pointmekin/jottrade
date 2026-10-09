import type { Page } from "@playwright/test";
import { expect, open, SeedUser, signIn, test } from "./support";

const CSV = new URL("fixtures/exness-trades.csv", import.meta.url).pathname;

async function previewImport(page: Page) {
	await page.getByRole("button", { name: "Import CSV" }).click();
	const dialog = page.getByRole("dialog", { name: "Import journal data" });
	await dialog.getByRole("checkbox", { name: /I confirm/ }).check();
	await dialog.locator('input[type="file"]').setInputFiles(CSV);
	return dialog;
}

test("a reimport of the same CSV adds no duplicate trades", async ({
	page,
}) => {
	await signIn(page, SeedUser.Erin);
	await open(page, "/journal");
	const eurusd = page.getByRole("link", { name: /EURUSD/ });
	const gbpusd = page.getByRole("link", { name: /GBPUSD/ });

	const first = await previewImport(page);
	await expect(first.getByText("2 source records · 2 insert")).toBeVisible();
	await first.getByRole("button", { name: "Apply import" }).click();
	await expect(first).toBeHidden();
	await page.reload();
	await expect(eurusd).toHaveCount(1);
	await expect(gbpusd).toHaveCount(1);

	const second = await previewImport(page);
	await expect(
		second.getByText("2 source records · 2 duplicate"),
	).toBeVisible();
	await expect(second.getByText(/Account change: \$0\.00 USD/)).toBeVisible();
	await second.getByRole("button", { name: "Apply import" }).click();
	await expect(second).toBeHidden();
	await page.reload();
	await expect(eurusd).toHaveCount(1);
	await expect(gbpusd).toHaveCount(1);
});

test("a CSV from another broker gets specific guidance", async ({ page }) => {
	await signIn(page, SeedUser.Erin);
	await open(page, "/journal");
	await page.getByRole("button", { name: "Import CSV" }).click();
	const dialog = page.getByRole("dialog", { name: "Import journal data" });
	await dialog.getByRole("checkbox", { name: /I confirm/ }).check();
	await dialog.locator('input[type="file"]').setInputFiles({
		name: "other-broker.csv",
		mimeType: "text/csv",
		buffer: Buffer.from("Date,Instrument,Side\n2026-09-01,EURUSD,Long\n"),
	});
	await expect(dialog.getByRole("alert")).toHaveText(
		"This file is not an Exness trade history CSV. Download the trade CSV from Exness History of orders. For an adjustment file, use the Adjustment CSV tab. Nothing was imported.",
	);
});
