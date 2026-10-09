import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// `npm run verify` runs this file on its disposable database, through the
// real Better Auth instance in src/lib/auth.ts.
const verifyUrl = process.env.VERIFY_DATABASE_URL;

const PASSWORD = "jottrade-dev-password";
const NEW_PASSWORD = "jottrade-new-password";
const HOUR_MS = 60 * 60 * 1000;

describe.skipIf(!verifyUrl)("password recovery on the verify database", () => {
	let auth: typeof import("@/lib/auth").auth;
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let orm: typeof import("drizzle-orm");

	beforeAll(async () => {
		expect(process.env.DATABASE_URL).toBe(verifyUrl);
		({ auth } = await import("@/lib/auth"));
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		orm = await import("drizzle-orm");
	});

	async function signUp() {
		const email = `recovery-${randomUUID()}@jottrade.test`;
		const { headers, response } = await auth.api.signUpEmail({
			body: { name: "Recovery Fixture", email, password: PASSWORD },
			returnHeaders: true,
		});
		const cookie = headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		return { email, userId: response.user.id, cookie: new Headers({ cookie }) };
	}

	function requestReset(email: string) {
		return auth.api.requestPasswordReset({
			body: { email, redirectTo: "/reset-password" },
		});
	}

	async function resetTokens(userId: string) {
		const rows = await db
			.select()
			.from(schema.verification)
			.where(
				orm.and(
					orm.eq(schema.verification.value, userId),
					orm.like(schema.verification.identifier, "reset-password:%"),
				),
			);
		return rows.map((row) => ({
			...row,
			token: row.identifier.replace("reset-password:", ""),
		}));
	}

	function canSignIn(email: string, password: string) {
		return auth.api
			.signInEmail({ body: { email, password } })
			.then(() => true)
			.catch(() => false);
	}

	it("gives the same response for an unknown and a known email", async () => {
		const { email } = await signUp();

		const known = await requestReset(email);
		const unknown = await requestReset(`nobody-${randomUUID()}@jottrade.test`);

		expect(unknown).toEqual(known);
	});

	it("creates a token that expires after 1 hour", async () => {
		const { email, userId } = await signUp();
		const before = Date.now();

		await requestReset(email);

		const [row] = await resetTokens(userId);
		expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(
			before + HOUR_MS - 1000,
		);
		expect(row.expiresAt.getTime()).toBeLessThanOrEqual(
			Date.now() + HOUR_MS + 1000,
		);
	});

	it("accepts a reset token one time only", async () => {
		const { email, userId } = await signUp();
		await requestReset(email);
		const [{ token }] = await resetTokens(userId);

		await expect(
			auth.api.resetPassword({ body: { token, newPassword: NEW_PASSWORD } }),
		).resolves.toEqual({ status: true });
		await expect(
			auth.api.resetPassword({
				body: { token, newPassword: "a-third-password" },
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });

		expect(await canSignIn(email, NEW_PASSWORD)).toBe(true);
		expect(await canSignIn(email, PASSWORD)).toBe(false);
		expect(await resetTokens(userId)).toHaveLength(0);
	});

	it("rejects an expired token and keeps the password", async () => {
		const { email, userId } = await signUp();
		await requestReset(email);
		const [{ id, token }] = await resetTokens(userId);
		await db
			.update(schema.verification)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(orm.eq(schema.verification.id, id));

		await expect(
			auth.api.resetPassword({ body: { token, newPassword: NEW_PASSWORD } }),
		).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
		expect(await canSignIn(email, PASSWORD)).toBe(true);
	});

	it("changes the password only with the current password", async () => {
		const { email, cookie } = await signUp();

		await expect(
			auth.api.changePassword({
				body: {
					currentPassword: "not-the-password",
					newPassword: NEW_PASSWORD,
				},
				headers: cookie,
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_PASSWORD" } });
		await auth.api.changePassword({
			body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
			headers: cookie,
		});

		expect(await canSignIn(email, NEW_PASSWORD)).toBe(true);
	});

	it("gives a Google-only user no credential change", async () => {
		const { userId, cookie } = await signUp();
		await db
			.update(schema.account)
			.set({
				providerId: "google",
				accountId: `google-${userId}`,
				password: null,
			})
			.where(orm.eq(schema.account.userId, userId));

		await expect(
			auth.api.changePassword({
				body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
				headers: cookie,
			}),
		).rejects.toMatchObject({ body: { code: "CREDENTIAL_ACCOUNT_NOT_FOUND" } });

		const accounts = await db
			.select()
			.from(schema.account)
			.where(orm.eq(schema.account.userId, userId));
		expect(accounts).toEqual([
			expect.objectContaining({ providerId: "google", password: null }),
		]);
	});
});
