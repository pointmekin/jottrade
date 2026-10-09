import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

// `npm run verify` runs this file on its disposable database, through the
// real Better Auth instance in src/lib/auth.ts.
const verifyUrl = process.env.VERIFY_DATABASE_URL;

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("@tanstack/react-start/server", async (importOriginal) => ({
	...(await importOriginal<object>()),
	getRequestHeaders: () => request.headers,
}));

const PASSWORD = "jottrade-dev-password";

describe.skipIf(!verifyUrl)("session revocation on the verify database", () => {
	let auth: typeof import("@/lib/auth").auth;
	let requireUserId: typeof import("@/lib/auth").requireUserId;

	beforeAll(async () => {
		expect(process.env.DATABASE_URL).toBe(verifyUrl);
		({ auth, requireUserId } = await import("@/lib/auth"));
	});

	function cookieOf(headers: Headers) {
		const cookie = headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		return new Headers({ cookie });
	}

	async function signUp() {
		const email = `sessions-${randomUUID()}@jottrade.test`;
		const { headers, response } = await auth.api.signUpEmail({
			body: { name: "Session Fixture", email, password: PASSWORD },
			returnHeaders: true,
		});
		return { email, userId: response.user.id, cookie: cookieOf(headers) };
	}

	async function signIn(email: string) {
		const { headers } = await auth.api.signInEmail({
			body: { email, password: PASSWORD },
			returnHeaders: true,
		});
		return cookieOf(headers);
	}

	function tokens(cookie: Headers) {
		return auth.api
			.listSessions({ headers: cookie })
			.then((sessions) => sessions.map((session) => session.token).sort());
	}

	async function currentToken(cookie: Headers) {
		const session = await auth.api.getSession({ headers: cookie });
		if (!session) throw new Error("No session.");
		return session.session.token;
	}

	it("lists only the sessions of the signed-in user", async () => {
		const alice = await signUp();
		const aliceLaptop = await signIn(alice.email);
		const bob = await signUp();

		const aliceTokens = await tokens(alice.cookie);
		const bobTokens = await tokens(bob.cookie);

		expect(aliceTokens).toEqual(
			[
				await currentToken(alice.cookie),
				await currentToken(aliceLaptop),
			].sort(),
		);
		expect(bobTokens).toEqual([await currentToken(bob.cookie)]);
	});

	it("does not revoke a session of another user", async () => {
		const alice = await signUp();
		const bob = await signUp();
		const bobToken = await currentToken(bob.cookie);

		await auth.api.revokeSession({
			body: { token: bobToken },
			headers: alice.cookie,
		});

		expect(await auth.api.getSession({ headers: bob.cookie })).not.toBeNull();
		expect(await tokens(bob.cookie)).toEqual([bobToken]);
	});

	it("a revoked session fails getSession and the server-function check", async () => {
		const { email, userId, cookie } = await signUp();
		const laptop = await signIn(email);

		await auth.api.revokeSession({
			body: { token: await currentToken(laptop) },
			headers: cookie,
		});

		expect(await auth.api.getSession({ headers: laptop })).toBeNull();
		request.headers = laptop;
		await expect(requireUserId()).rejects.toThrow("Unauthorized");
		request.headers = cookie;
		await expect(requireUserId()).resolves.toBe(userId);
	});

	it("revokes all other sessions and keeps the current one", async () => {
		const { email, cookie } = await signUp();
		const laptop = await signIn(email);
		const phone = await signIn(email);

		await auth.api.revokeOtherSessions({ headers: cookie });

		expect(await auth.api.getSession({ headers: laptop })).toBeNull();
		expect(await auth.api.getSession({ headers: phone })).toBeNull();
		expect(await tokens(cookie)).toEqual([await currentToken(cookie)]);
	});
});
