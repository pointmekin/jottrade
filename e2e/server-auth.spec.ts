import type { APIRequestContext, Page, Request } from "@playwright/test";
import { expect, open, SeedUser, signIn, test } from "./support";

const isServerFn = (request: Request) => request.url().includes("/_serverFn/");

async function replay(api: APIRequestContext, request: Request) {
	// Same request, but with the replaying context's own session cookie.
	const headers = { ...(await request.allHeaders()) };
	delete headers.cookie;
	const response = await api.fetch(request.url(), {
		method: request.method(),
		headers,
		data: request.postDataBuffer() ?? undefined,
	});
	return { status: response.status(), body: await response.text() };
}

async function captureTradeSave(page: Page) {
	let saved: Request | undefined;
	// Capture the real request, then stop it, so Alice's trade never changes.
	await page.route("**/_serverFn/**", async (route) => {
		if (route.request().method() !== "POST") return route.continue();
		saved = route.request();
		return route.abort();
	});
	await page.getByRole("button", { name: "Save Changes" }).click();
	await expect.poll(() => saved).toBeDefined();
	await page.unrouteAll({ behavior: "ignoreErrors" });
	return saved as Request;
}

test("server functions reject a missing session and another user's session", async ({
	page,
	playwright,
	browser,
	extraHTTPHeaders,
}, testInfo) => {
	const baseURL = testInfo.project.use.baseURL;
	await signIn(page, SeedUser.Alice);
	const tradesRequest = page.waitForRequest(
		(request) => isServerFn(request) && request.url().includes("portfolioId"),
	);
	await open(page, "/journal");
	const read = await tradesRequest;
	await page.getByRole("link", { name: /AAPL/ }).first().click();
	await expect(page.getByRole("heading", { name: "AAPL" })).toBeVisible();
	const write = await captureTradeSave(page);

	const anonymous = await playwright.request.newContext({
		baseURL,
		extraHTTPHeaders,
	});
	const bobContext = await browser.newContext({ baseURL, extraHTTPHeaders });
	const bob = await bobContext.newPage();
	await signIn(bob, SeedUser.Bob);

	const results = {
		anonymousRead: await replay(anonymous, read),
		anonymousWrite: await replay(anonymous, write),
		bobRead: await replay(bob.request, read),
		bobWrite: await replay(bob.request, write),
	};
	await testInfo.attach("responses.json", {
		body: JSON.stringify(results, null, 2),
		contentType: "application/json",
	});

	expect(results.anonymousRead.body).toContain("Unauthorized");
	expect(results.anonymousWrite.body).toContain("Unauthorized");
	expect(results.bobRead.body).not.toContain("AAPL");
	expect(results.bobWrite.body).toContain("Trade not found");
	for (const result of Object.values(results)) {
		expect(result.body).not.toContain("AAPL");
	}
	await anonymous.dispose();
	await bobContext.close();
});
