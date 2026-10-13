import type { Page } from "@playwright/test";
import { expect, open, SeedUser, signIn, test } from "./support";

const CSV = new URL("fixtures/exness-trades.csv", import.meta.url).pathname;
const PARTIAL_CLOSE_CSV = new URL(
	"fixtures/exness-partial-close.csv",
	import.meta.url,
).pathname;

async function previewImport(page: Page, file = CSV) {
	await page.getByRole("button", { name: "Import CSV" }).click();
	const dialog = page.getByRole("dialog", { name: "Import journal data" });
	await dialog.getByRole("checkbox", { name: /I confirm/ }).check();
	await dialog.locator('input[type="file"]').setInputFiles(file);
	return dialog;
}

async function previewUndo(page: Page) {
	await page.getByRole("button", { name: "Import CSV" }).click();
	const dialog = page.getByRole("dialog", { name: "Import journal data" });
	await dialog.getByRole("tab", { name: "Import history" }).click();
	await dialog
		.getByRole("listitem")
		.filter({ hasText: "exness-partial-close.csv" })
		.getByRole("button", { name: "Details and recovery" })
		.click();
	await dialog
		.getByRole("button", { name: "Preview selected batch undo" })
		.click();
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

test("a partial close groups into one position only after the user confirms", async ({
	page,
}) => {
	await signIn(page, SeedUser.Erin);
	await open(page, "/journal");
	const audusd = page.getByRole("link", { name: /AUDUSD/ });

	const preview = await previewImport(page, PARTIAL_CLOSE_CSV);
	await expect(preview.getByText("2 source records · 2 insert")).toBeVisible();
	await preview.getByRole("button", { name: "Apply import" }).click();
	await expect(preview).toBeHidden();
	await page.reload();
	await expect(audusd).toHaveCount(2);

	await page.getByRole("button", { name: "Review groups" }).click();
	const groups = page.getByRole("dialog", { name: "Possible partial closes" });
	await expect(groups.getByText("Position total +$7.90")).toBeVisible();
	await groups.getByRole("button", { name: "Group", exact: true }).click();
	await expect(groups).toBeHidden();
	await expect(audusd).toHaveCount(1);

	const blocked = await previewUndo(page);
	await expect(
		blocked.getByText("Trade is grouped into a position. Ungroup it first."),
	).toHaveCount(2);
	await page.keyboard.press("Escape");

	await audusd.click();
	await expect(page.getByText("Grouped from 2 broker rows")).toBeVisible();
	await page.getByRole("button", { name: "Ungroup" }).click();
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Ungroup" })
		.click();
	await expect(page).toHaveURL(/\/journal(\?|$)/);
	await expect(audusd).toHaveCount(2);

	const eligible = await previewUndo(page);
	await expect(eligible.getByText("Eligible to undo")).toHaveCount(2);
	await eligible
		.getByRole("button", { name: "Undo eligible records in this batch" })
		.click();
	await page.keyboard.press("Escape");
	await page.reload();
	await expect(audusd).toHaveCount(0);
});
