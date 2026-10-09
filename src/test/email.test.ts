import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPasswordResetEmail } from "@/lib/email";

const URL = "https://jottrade.test/api/auth/reset-password/secret-token";
const TO = "user@jottrade.test";

const METHODS = ["debug", "info", "log", "warn", "error"] as const;
let spies: ReturnType<typeof vi.spyOn>[] = [];

function logged() {
	return spies
		.flatMap((spy) => spy.mock.calls)
		.map((args) => args.map(String).join(" "))
		.join("\n");
}

function useEnv(env: Record<string, string>) {
	for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
	spies = METHODS.map((method) =>
		vi.spyOn(console, method).mockImplementation(() => {}),
	);
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("sendPasswordResetEmail", () => {
	it("posts the email to Resend when it has a key and a sender", async () => {
		useEnv({
			NODE_ENV: "production",
			RESEND_API_KEY: "re_test",
			EMAIL_FROM: "JotTrade <no-reply@jottrade.test>",
		});
		const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", fetch);

		await sendPasswordResetEmail(TO, URL);

		expect(fetch).toHaveBeenCalledOnce();
		const [endpoint, init] = fetch.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(endpoint).toBe("https://api.resend.com/emails");
		expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
		expect(JSON.parse(String(init.body))).toMatchObject({
			from: "JotTrade <no-reply@jottrade.test>",
			to: [TO],
			text: expect.stringContaining(URL),
		});
		expect(logged()).not.toContain("secret-token");
	});

	it("stops waiting for Resend after 5 seconds", async () => {
		useEnv({
			NODE_ENV: "production",
			RESEND_API_KEY: "re_test",
			EMAIL_FROM: "no-reply@jottrade.test",
		});
		const timeout = vi.spyOn(AbortSignal, "timeout");
		const fetch = vi.fn(async (_url: string, init: RequestInit) => {
			throw init.signal?.reason ?? new Error("no signal");
		});
		vi.stubGlobal("fetch", fetch);
		timeout.mockImplementation(() => AbortSignal.abort(new Error("timed out")));

		await expect(sendPasswordResetEmail(TO, URL)).rejects.toThrow("timed out");
		expect(timeout).toHaveBeenCalledWith(5_000);
	});

	it.each([
		["RESEND_API_KEY", { EMAIL_FROM: "no-reply@jottrade.test" }],
		["EMAIL_FROM", { RESEND_API_KEY: "re_test" }],
	])(
		"fails in production without %s and does not log the link",
		async (missing, env) => {
			useEnv({
				NODE_ENV: "production",
				RESEND_API_KEY: "",
				EMAIL_FROM: "",
				...env,
			});
			const fetch = vi.fn();
			vi.stubGlobal("fetch", fetch);

			await expect(sendPasswordResetEmail(TO, URL)).rejects.toThrow(missing);
			expect(fetch).not.toHaveBeenCalled();
			expect(logged()).not.toContain("secret-token");
		},
	);

	it("fails when Resend rejects the email, with the status only", async () => {
		useEnv({
			NODE_ENV: "production",
			RESEND_API_KEY: "re_test",
			EMAIL_FROM: "no-reply@jottrade.test",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(`{"message":"invalid recipient ${TO}"}`, {
						status: 422,
					}),
			),
		);

		const error = await sendPasswordResetEmail(TO, URL).catch((e) => e);
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toContain("422");
		expect(error.message).not.toContain("secret-token");
		expect(error.message).not.toContain(TO);
	});

	it("writes the link to the server log outside production without a key", async () => {
		useEnv({ NODE_ENV: "development", RESEND_API_KEY: "", EMAIL_FROM: "" });
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);

		await sendPasswordResetEmail(TO, URL);

		expect(fetch).not.toHaveBeenCalled();
		expect(logged()).toContain(URL);
	});
});
