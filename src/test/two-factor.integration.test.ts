import { randomUUID } from "node:crypto";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { beforeAll, describe, expect, it } from "vitest";

// `npm run verify` runs this file on its disposable database, through the
// real Better Auth instance in src/lib/auth.ts.
const verifyUrl = process.env.VERIFY_DATABASE_URL;

const PASSWORD = "jottrade-dev-password";

describe.skipIf(!verifyUrl)("two-factor on the verify database", () => {
	let auth: typeof import("@/lib/auth").auth;

	beforeAll(async () => {
		expect(process.env.DATABASE_URL).toBe(verifyUrl);
		({ auth } = await import("@/lib/auth"));
	});

	function cookieOf(headers: Headers) {
		const cookie = headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		return new Headers({ cookie });
	}

	function totpCode(totpURI: string) {
		const secret = new URL(totpURI).searchParams.get("secret") ?? "";
		return createOTP(new TextDecoder().decode(base32.decode(secret))).totp();
	}

	async function signUp() {
		const email = `two-factor-${randomUUID()}@jottrade.test`;
		const { headers } = await auth.api.signUpEmail({
			body: { name: "Two-Factor Fixture", email, password: PASSWORD },
			returnHeaders: true,
		});
		return { email, cookie: cookieOf(headers) };
	}

	async function enroll() {
		const { email, cookie } = await signUp();
		const { totpURI, backupCodes } = await auth.api
			.enableTwoFactor({ body: { password: PASSWORD }, headers: cookie })
			.then((result) => {
				if (!("totpURI" in result)) throw new Error("No TOTP enrollment.");
				return result;
			});
		const { headers } = await auth.api.verifyTOTP({
			body: { code: await totpCode(totpURI) },
			headers: cookie,
			returnHeaders: true,
		});
		return { email, totpURI, backupCodes, cookie: cookieOf(headers) };
	}

	async function signIn(email: string) {
		const { headers, response } = await auth.api.signInEmail({
			body: { email, password: PASSWORD },
			returnHeaders: true,
		});
		return { challenge: cookieOf(headers), response };
	}

	async function hasSession(cookie: Headers) {
		return (await auth.api.getSession({ headers: cookie })) !== null;
	}

	it("enables two-factor only with the password and a valid code", async () => {
		const { cookie } = await signUp();

		await expect(
			auth.api.enableTwoFactor({
				body: { password: "not-the-password" },
				headers: cookie,
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_PASSWORD" } });
		await auth.api.enableTwoFactor({
			body: { password: PASSWORD },
			headers: cookie,
		});
		await expect(
			auth.api.verifyTOTP({ body: { code: "000000" }, headers: cookie }),
		).rejects.toMatchObject({ body: { code: "INVALID_CODE" } });

		const session = await auth.api.getSession({ headers: cookie });
		expect(session?.user.twoFactorEnabled).toBe(false);
	});

	it("asks for a code at sign-in and accepts the authenticator code", async () => {
		const { email, totpURI } = await enroll();

		const { challenge, response } = await signIn(email);
		expect(response).toMatchObject({ twoFactorRedirect: true });
		expect(await hasSession(challenge)).toBe(false);

		const { headers } = await auth.api.verifyTOTP({
			body: { code: await totpCode(totpURI) },
			headers: challenge,
			returnHeaders: true,
		});
		expect(await hasSession(cookieOf(headers))).toBe(true);
	});

	it("accepts each recovery code one time", async () => {
		const { email, backupCodes } = await enroll();
		expect(backupCodes).toHaveLength(10);

		const first = await signIn(email);
		const { headers } = await auth.api.verifyBackupCode({
			body: { code: backupCodes[0] },
			headers: first.challenge,
			returnHeaders: true,
		});
		expect(await hasSession(cookieOf(headers))).toBe(true);

		const second = await signIn(email);
		await expect(
			auth.api.verifyBackupCode({
				body: { code: backupCodes[0] },
				headers: second.challenge,
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_BACKUP_CODE" } });
	});

	it("replaces the recovery codes only with the password", async () => {
		const { email, backupCodes, cookie } = await enroll();

		await expect(
			auth.api.generateBackupCodes({
				body: { password: "not-the-password" },
				headers: cookie,
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_PASSWORD" } });
		const next = await auth.api.generateBackupCodes({
			body: { password: PASSWORD },
			headers: cookie,
		});

		const { challenge } = await signIn(email);
		await expect(
			auth.api.verifyBackupCode({
				body: { code: backupCodes[1] },
				headers: challenge,
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_BACKUP_CODE" } });
		await auth.api.verifyBackupCode({
			body: { code: next.backupCodes[0] },
			headers: challenge,
		});
	});

	it("disables two-factor only with the password", async () => {
		const { email, cookie } = await enroll();

		await expect(
			auth.api.disableTwoFactor({
				body: { password: "not-the-password" },
				headers: cookie,
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_PASSWORD" } });
		await auth.api.disableTwoFactor({
			body: { password: PASSWORD },
			headers: cookie,
		});

		const { challenge, response } = await signIn(email);
		expect(response).not.toHaveProperty("twoFactorRedirect");
		expect(await hasSession(challenge)).toBe(true);
	});
});
