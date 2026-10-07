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
