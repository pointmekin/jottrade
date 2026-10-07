import { defineConfig, devices } from "@playwright/test";

// `npm run verify` (scripts/verify/run.ts) sets these after it prepares a
// disposable database and a production build. See docs/quality-gate.md.
const baseURL = process.env.VERIFY_BASE_URL;
if (!baseURL) {
	throw new Error("Run the browser suite with `npm run verify`.");
}
const isCI = Boolean(process.env.CI);

export default defineConfig({
	testDir: "e2e",
	outputDir: "test-results",
	timeout: 30_000,
	expect: { timeout: 10_000 },
	fullyParallel: true,
	forbidOnly: isCI,
	retries: 0,
	workers: isCI ? 2 : undefined,
	reporter: [
		["list"],
		["html", { open: "never", outputFolder: "playwright-report" }],
	],
	use: {
		baseURL,
		// Fixed zone and locale, so calendar days and money text are stable.
		timezoneId: "UTC",
		locale: "en-US",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			testIgnore: /baseline\.spec\.ts/,
			// The headless shell crashed on the dashboard in local runs; full Chromium does not.
			use: { ...devices["Desktop Chrome"], channel: "chromium" },
		},
		{
			name: "baseline",
			testMatch: /baseline\.spec\.ts/,
			dependencies: ["chromium"],
			use: { ...devices["Desktop Chrome"], channel: "chromium" },
		},
	],
	webServer: {
		command: "node .output/server/index.mjs",
		url: `${baseURL}/sign-in`,
		reuseExistingServer: false,
		timeout: 60_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
