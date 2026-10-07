import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// `npm run verify` runs this file on its disposable database. It uses the
// real Better Auth instance, so the sign-up hook in src/lib/auth.ts runs.
const verifyUrl = process.env.VERIFY_DATABASE_URL;

describe.skipIf(!verifyUrl)("sign-up provisioning", () => {
	it("gives a new user one default account at sign-up", async () => {
		expect(process.env.DATABASE_URL).toBe(verifyUrl);
		const { auth } = await import("@/lib/auth");
		const { db } = await import("@/db");
		const { portfolios } = await import("@/db/schema");
		const { eq } = await import("drizzle-orm");

		const { user } = await auth.api.signUpEmail({
			body: {
				name: "Provisioning Fixture",
				email: `provisioning-${randomUUID()}@jottrade.test`,
				password: "jottrade-dev-password",
			},
		});

		const rows = await db
			.select()
			.from(portfolios)
			.where(eq(portfolios.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: "Main account", isDefault: true });
	});
});
