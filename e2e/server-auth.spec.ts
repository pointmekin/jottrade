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
	// getTrades: its payload names the journal filters and the page.
	const tradesRequest = page.waitForRequest((request) => {
		const url = decodeURIComponent(request.url());
		return (
			isServerFn(request) && url.includes('"symbol"') && url.includes('"page"')
		);
	});
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
		aliceRead: await replay(page.request, read),
		anonymousRead: await replay(anonymous, read),
		anonymousWrite: await replay(anonymous, write),
		bobRead: await replay(bob.request, read),
		bobWrite: await replay(bob.request, write),
	};
	await testInfo.attach("responses.json", {
		body: JSON.stringify(results, null, 2),
		contentType: "application/json",
	});

	// Server-function errors also return HTTP 200, so the body tells the
	// outcome. The CSRF check would answer "Forbidden", not "Unauthorized".
	// The replay itself works: Alice gets her own trades back.
	expect(results.aliceRead.status).toBe(200);
	expect(results.aliceRead.body).toContain("AAPL");
	expect(results.anonymousRead.body).toContain("Unauthorized");
	expect(results.anonymousWrite.body).toContain("Unauthorized");
	// Bob passes the auth check; the ownership filter returns an empty page.
	expect(results.bobRead.body).toContain("total");
	expect(results.bobRead.body).not.toMatch(/AAPL|Unauthorized|Forbidden/);
	expect(results.bobWrite.body).toContain("Trade not found");
	await anonymous.dispose();
	await bobContext.close();
});
