import { expect, open, SeedUser, signIn, test } from "./support";

// A record, not a budget: docs/quality-gate.md defines the conditions and the
// first numbers. The baseline project runs after the other specs finish.
test("startup and navigation baseline", async ({ page }, testInfo) => {
	const start = performance.now();
	await open(page, "/sign-in");
	await expect(
		page.getByRole("heading", { name: "Welcome back" }),
	).toBeVisible();
	const signInReady = performance.now() - start;
	const navigation = await page.evaluate(() => {
		const [entry] = performance.getEntriesByType(
			"navigation",
		) as PerformanceNavigationTiming[];
		return {
			ttfb: entry.responseStart,
			domContentLoaded: entry.domContentLoadedEventEnd,
		};
	});

	await signIn(page, SeedUser.Alice);
	const timeTo = async (path: string, ready: () => Promise<void>) => {
		const begin = performance.now();
		await open(page, path);
		await ready();
		return Math.round(performance.now() - begin);
	};
	const dashboardReady = await timeTo("/dashboard", () =>
		expect(page.getByText(/Across \d+ trades/)).toBeVisible(),
	);
	const journalReady = await timeTo("/journal", () =>
		expect(page.getByRole("link", { name: /AAPL/ }).first()).toBeVisible(),
	);

	const baseline = {
		signInTtfbMs: Math.round(navigation.ttfb),
		signInDomContentLoadedMs: Math.round(navigation.domContentLoaded),
		signInReadyMs: Math.round(signInReady),
		dashboardReadyMs: dashboardReady,
		journalReadyMs: journalReady,
	};
	await testInfo.attach("baseline.json", {
		body: JSON.stringify(baseline, null, 2),
		contentType: "application/json",
	});
	process.stdout.write(`Baseline: ${JSON.stringify(baseline)}\n`);
});
