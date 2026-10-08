import { test as base, expect, type Page } from "@playwright/test";

let clients = 0;

// Better Auth limits sign-in per client IP (x-forwarded-for) in production.
// Each test acts as its own client, so parallel tests do not share one limit.
export const test = base.extend({
	extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
		clients += 1;
		const ip = `10.${testInfo.workerIndex % 256}.${Math.floor(clients / 250)}.${(clients % 250) + 1}`;
		await use({ ...extraHTTPHeaders, "x-forwarded-for": ip });
	},
});

export { expect };

// Seed users from scripts/db/seed-accounts.ts. Specs run in parallel and in
// any order. A spec reads only seed data that no spec writes, or rows that it
// writes itself: trades.spec.ts and import.spec.ts both write to Erin, with
// different symbols.
export const SeedUser = {
	Alice: "alice@jottrade.test",
	Bob: "bob@jottrade.test",
	Erin: "erin@jottrade.test",
	Nora: "nora@jottrade.test",
	Sam: "sam@jottrade.test",
} as const;

export type SeedUser = (typeof SeedUser)[keyof typeof SeedUser];

export const SEED_PASSWORD = "jottrade-dev-password";

export async function signIn(page: Page, email: SeedUser) {
	const response = await page.request.post("/api/auth/sign-in/email", {
		data: { email, password: SEED_PASSWORD },
	});
	expect(response.ok(), `sign in as ${email}`).toBe(true);
}

export async function open(page: Page, path: string) {
	await page.goto(path, { waitUntil: "domcontentloaded" });
}

/** "+$1,234.50" → 1234.5 */
export function money(text: string): number {
	const value = Number(text.replaceAll(/[^0-9.-]/g, ""));
	if (Number.isNaN(value)) throw new Error(`Not a money value: ${text}`);
	return value;
}
