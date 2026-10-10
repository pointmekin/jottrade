import { expect, open, SEED_PASSWORD, SeedUser, signIn, test } from "./support";

test("a protected page sends a signed-out visitor to sign in", async ({
	page,
}) => {
	await open(page, "/journal");

	await expect(page).toHaveURL(/\/sign-in$/);
	await expect(
		page.getByRole("heading", { name: "Welcome back" }),
	).toBeVisible();
});

test("sign in with email keeps the session after a reload", async ({
	page,
}) => {
	await open(page, "/sign-in");
	await page.getByLabel("Email").fill(SeedUser.Alice);
	await page.getByLabel("Password").fill(SEED_PASSWORD);
	await page.getByRole("button", { name: "Sign In", exact: true }).click();

	await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
	await page.reload();
	await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
	await expect(page.getByText(SeedUser.Alice)).toBeVisible();
});

test("a wrong password shows an error and does not sign in", async ({
	page,
}) => {
	await open(page, "/sign-in");
	await page.getByLabel("Email").fill(SeedUser.Alice);
	await page.getByLabel("Password").fill("not-the-password");
	await page.getByRole("button", { name: "Sign In", exact: true }).click();

	await expect(page.getByText(/invalid email or password/i)).toBeVisible();
	await open(page, "/journal");
	await expect(page).toHaveURL(/\/sign-in$/);
});

test("a user cannot open another user's trade", async ({
	page,
	browser,
	extraHTTPHeaders,
}, testInfo) => {
	await signIn(page, SeedUser.Alice);
	await open(page, "/journal");
	await page.getByRole("link", { name: /AAPL/ }).first().click();
	await expect(page.getByRole("heading", { name: "AAPL" })).toBeVisible();

	const bobContext = await browser.newContext({
		baseURL: testInfo.project.use.baseURL,
		extraHTTPHeaders,
	});
	const bob = await bobContext.newPage();
	await signIn(bob, SeedUser.Bob);
	await open(bob, page.url());

	await expect(bob.getByText("Journal entry not found")).toBeVisible();
	await expect(bob.getByRole("heading", { name: "AAPL" })).toHaveCount(0);
	await bobContext.close();
});

const DRAFT_PREFIXES = [
	"jottrade.trade-draft.v1:",
	"jottrade.review-draft.v1:",
];

test("sign-out deletes the user's drafts, and the next user sees none", async ({
	page,
}) => {
	await signIn(page, SeedUser.Alice);
	await open(page, "/journal");
	await page.getByRole("button", { name: "Log Trade" }).click();
	const form = page.getByRole("dialog", { name: "Log New Trade" });
	await form.getByRole("textbox", { name: "Symbol" }).fill("E2ESHARED");
	await form.getByRole("button", { name: "Cancel" }).click();
	const draftKeys = () =>
		page.evaluate(
			(prefixes) =>
				Object.keys(localStorage).filter((key) =>
					prefixes.some((prefix) => key.startsWith(prefix)),
				),
			DRAFT_PREFIXES,
		);
	await expect.poll(draftKeys).toHaveLength(1);
	const [aliceKey] = await draftKeys();

	await page.getByRole("button", { name: /Alice Active/ }).click();
	await page.getByRole("menuitem", { name: "Sign out" }).click();
	const confirm = page.getByRole("alertdialog", {
		name: "Delete drafts and sign out?",
	});
	await expect(confirm).toContainText(
		"1 draft on this device is not in your journal.",
	);
	await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
	await confirm
		.getByRole("button", { name: "Delete drafts and sign out" })
		.click();
	await expect(page).toHaveURL(/\/sign-in$/);
	expect(await draftKeys()).toEqual([]);

	await signIn(page, SeedUser.Bob);
	await open(page, "/journal");
	await expect(page.getByRole("button", { name: /^Log Trade/ })).toHaveText(
		"Log Trade",
	);
	expect(
		await page.evaluate((key) => localStorage.getItem(key), aliceKey),
	).toBeNull();
});

test.describe("sign-out on a phone", () => {
	test.use({ viewport: { width: 375, height: 812 } });

	test("Cancel keeps the draft and the session", async ({ page }) => {
		await signIn(page, SeedUser.Sam);
		await open(page, "/journal");
		const logTrade = page.getByRole("button", { name: /^Log Trade/ });
		await logTrade.click();
		const form = page.getByRole("dialog", { name: "Log New Trade" });
		await form.getByRole("textbox", { name: "Symbol" }).fill("E2EPHONE");
		await form.getByRole("button", { name: "Cancel" }).click();
		await expect(logTrade).toHaveAccessibleName("Log Trade Draft");

		await page
			.getByRole("button", { name: "Open account and settings" })
			.click();
		await page.getByRole("button", { name: "Sign out" }).click();
		const confirm = page.getByRole("alertdialog", {
			name: "Delete drafts and sign out?",
		});
		const cancel = confirm.getByRole("button", { name: "Cancel" });
		await expect(cancel).toBeFocused();
		await page.keyboard.press("Enter");

		await expect(confirm).toBeHidden();
		await expect(page).toHaveURL(/\/journal(\?|$)/);
		await expect(logTrade).toHaveAccessibleName("Log Trade Draft");
	});
});

const NOTE_SYMBOL = "E2ENOTE";

test("offline notes save on reconnect, and a newer edit gives a conflict", async ({
	page,
	context,
	browser,
	extraHTTPHeaders,
}, testInfo) => {
	await signIn(page, SeedUser.Erin);
	await open(page, "/journal");
	await page.getByRole("button", { name: /^Log Trade/ }).click();
	const form = page.getByRole("dialog", { name: "Log New Trade" });
	await form.getByRole("textbox", { name: "Symbol" }).fill(NOTE_SYMBOL);
	await form
		.getByRole("textbox", { name: "Entry date" })
		.fill("2026-09-03T08:00");
	await form.getByRole("spinbutton", { name: "Entry price" }).fill("10");
	await form.getByRole("spinbutton", { name: "Quantity (units)" }).fill("1");
	await form.getByRole("button", { name: "Log Long" }).click();
	await expect(form).toBeHidden();
	await page.getByRole("link", { name: new RegExp(NOTE_SYMBOL) }).click();
	await expect(page.getByRole("heading", { name: NOTE_SYMBOL })).toBeVisible();
	const tradeUrl = page.url();
	const notes = page.getByRole("textbox", { name: "Notes and review" });

	await context.setOffline(true);
	await notes.fill("Written offline.");
	await expect(
		page.getByText("Offline. Saved on this device only."),
	).toBeVisible();
	await context.setOffline(false);
	await expect(page.getByText("Saved", { exact: true })).toBeVisible();
	await page.reload();
	await expect(notes).toHaveValue("Written offline.");

	await context.setOffline(true);
	await notes.fill("Second offline edit.");
	await expect(
		page.getByText("Offline. Saved on this device only."),
	).toBeVisible();

	const phoneContext = await browser.newContext({
		baseURL: testInfo.project.use.baseURL,
		extraHTTPHeaders,
	});
	const phone = await phoneContext.newPage();
	await signIn(phone, SeedUser.Erin);
	await open(phone, tradeUrl);
	const phoneNotes = phone.getByRole("textbox", { name: "Notes and review" });
	await expect(phoneNotes).toHaveValue("Written offline.");
	await phoneNotes.fill("Edited on the phone.");
	await expect(phone.getByText("Saved", { exact: true })).toBeVisible();

	await context.setOffline(false);
	await expect(page.getByText(/Changed elsewhere/)).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Keep my draft" }),
	).toBeVisible();
	await expect(notes).toHaveValue("Second offline edit.");
	await phone.reload();
	await expect(phoneNotes).toHaveValue("Edited on the phone.");
	await phoneContext.close();

	await page.getByRole("button", { name: "Use server text" }).click();
	await page.getByRole("button", { name: "Delete trade" }).click();
	await page
		.getByRole("alertdialog", { name: "Delete trade?" })
		.getByRole("button", { name: "Delete permanently" })
		.click();
	await expect(page).toHaveURL(/\/journal(\?|$)/);
});
