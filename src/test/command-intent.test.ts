import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commandIntentSchema } from "@/lib/commands/intent-schema";
import { extractCommandIntent } from "@/server/commandIntentActions";

const mocks = vi.hoisted(() => ({ session: vi.fn(), fetch: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		let schema: { parse: (data: unknown) => unknown };
		const builder = {
			validator: (value: typeof schema) => {
				schema = value;
				return builder;
			},
			handler:
				(fn: (context: { data: unknown }) => unknown) =>
				async (context: { data: unknown }) =>
					fn({ data: schema.parse(context.data) }),
		};
		return builder;
	},
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
const command = "I just put another thousand dollars into my trading account";
const intent = {
	type: "account-entry",
	params: { kind: "DEPOSIT", amount: "1000", currency: "USD" },
};
function response(value: unknown = intent) {
	return new Response(
		JSON.stringify({
			candidates: [
				{
					finishReason: "STOP",
					content: { parts: [{ text: JSON.stringify(value) }] },
				},
			],
		}),
	);
}
let user = 0;
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("GEMINI_API_KEY", "test-secret");
	vi.stubGlobal("fetch", mocks.fetch);
	mocks.session.mockResolvedValue({ user: { id: `user-${user++}` } });
	mocks.fetch.mockImplementation(() => Promise.resolve(response()));
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
describe("command extraction", () => {
	it("requires authentication before any provider request", async () => {
		mocks.session.mockResolvedValue(null);
		expect(await extractCommandIntent({ data: { command } })).toMatchObject({
			error: expect.any(String),
		});
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it.each(["", " ", "x".repeat(1001)])("bounds input %s", async (command) => {
		await expect(extractCommandIntent({ data: { command } })).rejects.toThrow();
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it("keeps high confidence commands local even if the endpoint is called", async () => {
		expect(
			await extractCommandIntent({
				data: { command: "short gold 4550 target 4500 0.01 lot" },
			}),
		).toMatchObject({
			intent: {
				type: "trade",
				params: { quantity: "0.01", targetPrice: "4500" },
			},
		});
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it("returns a validated interpretation and sends only command text with static instructions", async () => {
		expect(await extractCommandIntent({ data: { command } })).toEqual({
			intent,
		});
		const [url, options] = mocks.fetch.mock.calls[0];
		expect(url).not.toContain("test-secret");
		expect(options.headers["x-goog-api-key"]).toBe("test-secret");
		const body = JSON.parse(options.body);
		expect(body.contents).toEqual([
			{ role: "user", parts: [{ text: command }] },
		]);
		expect(options.body).not.toContain("user-");
		expect(body.generationConfig.responseJsonSchema).toBeTruthy();
		expect(body.tools).toBeUndefined();
	});
	it("fails safely without a key", async () => {
		vi.stubEnv("GEMINI_API_KEY", "");
		expect(await extractCommandIntent({ data: { command } })).toMatchObject({
			error: expect.any(String),
		});
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it.each([
		{ type: "navigation", path: "https://evil.example" },
		{ type: "theme", theme: "invalid" },
		{ type: "account-entry", params: { kind: "ADJUSTMENT", amount: "100" } },
		{ ...intent, params: { ...intent.params, portfolioId: 8 } },
		{ ...intent, params: { ...intent.params, amount: "-1" } },
		{ type: "trade", params: { quantity: "0.01" } },
	])("rejects invalid or privileged model output", async (value) => {
		mocks.fetch.mockResolvedValue(response(value));
		expect(await extractCommandIntent({ data: { command } })).toMatchObject({
			error: expect.any(String),
		});
	});
	it("retains unknown and missing fields", async () => {
		mocks.fetch.mockResolvedValueOnce(response({ type: "unknown" }));
		expect(await extractCommandIntent({ data: { command } })).toEqual({
			intent: { type: "unknown" },
		});
		mocks.fetch.mockResolvedValueOnce(
			response({ type: "trade", params: { symbol: "GOLD" } }),
		);
		expect(await extractCommandIntent({ data: { command } })).toEqual({
			intent: { type: "trade", params: { symbol: "GOLD" } },
		});
	});
	it.each([429, 500])(
		"handles provider HTTP %s without leaking its body",
		async (status) => {
			mocks.fetch.mockResolvedValue(
				new Response("private provider error", { status }),
			);
			const result = await extractCommandIntent({ data: { command } });
			expect(result).toMatchObject({ error: expect.any(String) });
			expect(JSON.stringify(result)).not.toContain("private");
		},
	);
	it("handles network failure without leaking error text", async () => {
		mocks.fetch.mockRejectedValue(new Error("secret provider detail"));
		expect(await extractCommandIntent({ data: { command } })).toEqual({
			error:
				"Gemini could not interpret this command. Try again or use a local command.",
		});
	});
	it.each(["not JSON", JSON.stringify({ candidates: [] }), "x".repeat(17000)])(
		"rejects malformed or oversized responses",
		async (body) => {
			mocks.fetch.mockResolvedValue(new Response(body));
			expect(await extractCommandIntent({ data: { command } })).toMatchObject({
				error: expect.any(String),
			});
		},
	);
	it("rejects truncated output even if its JSON is valid", async () => {
		mocks.fetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					candidates: [
						{
							finishReason: "MAX_TOKENS",
							content: { parts: [{ text: JSON.stringify(intent) }] },
						},
					],
				}),
			),
		);
		expect(await extractCommandIntent({ data: { command } })).toMatchObject({
			error: expect.any(String),
		});
	});
	it("limits repeated requests from one user", async () => {
		for (let i = 0; i < 5; i++)
			await extractCommandIntent({ data: { command } });
		expect(await extractCommandIntent({ data: { command } })).toMatchObject({
			error: expect.stringContaining("minute"),
		});
		expect(mocks.fetch).toHaveBeenCalledTimes(5);
	});
});
describe("intent schema", () => {
	it("preserves decimals, currency and quantity units", () => {
		const trade = {
			type: "trade",
			params: {
				symbol: "XAUUSDM",
				side: "SHORT",
				entryPrice: "4550",
				quantity: "0.01",
				quantityUnit: "LOTS",
				targetPrice: "4500",
			},
		};
		expect(commandIntentSchema.parse(trade)).toEqual(trade);
		expect(commandIntentSchema.parse(intent)).toEqual(intent);
	});
});
