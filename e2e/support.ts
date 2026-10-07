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

// Seed users from scripts/db/seed-accounts.ts. Each spec reads only data that
// no other spec writes, so specs can run in any order or in parallel.
export const SeedUser = {
	Alice: "alice@jottrade.test",
	Bob: "bob@jottrade.test",
	Erin: "erin@jottrade.test",
	Nora: "nora@jottrade.test",
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
