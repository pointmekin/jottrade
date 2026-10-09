import { expect, open, test } from "./support";

test("the browser loads the JotTrade manifest and icons", async ({
	page,
	request,
}) => {
	await open(page, "/sign-in");
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
		"href",
		"/manifest.webmanifest",
	);

	const response = await request.get("/manifest.webmanifest");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toContain(
		"application/manifest+json",
	);

	const cdp = await page.context().newCDPSession(page);
	const { errors, data } = await cdp.send("Page.getAppManifest");
	expect(errors).toEqual([]);
	const manifest = JSON.parse(data ?? "{}") as {
		name: string;
		icons: { src: string }[];
	};
	expect(manifest.name).toBe("JotTrade");

	const icons = [
		...manifest.icons.map((icon) => icon.src),
		"/icons/apple-touch-icon.png",
		"/favicon.ico",
	];
	for (const src of icons) {
		const icon = await request.get(src);
		expect(icon.status(), src).toBe(200);
		expect(icon.headers()["content-type"], src).toMatch(/^image\//);
	}
});
