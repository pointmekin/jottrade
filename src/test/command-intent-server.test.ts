import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractCommandIntent } from "@/server/commandIntentActions";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
vi.mock("@/lib/auth", () => ({
	requireUserId: async () => {
		const session = await mocks.session();
		if (!session) throw new Error("Unauthorized");
		return session.user.id;
	},
}));

function reply(text: string) {
	return {
		ok: true,
		json: async () => ({
			steps: [{ type: "model_output", content: [{ type: "text", text }] }],
		}),
	};
}
const run = (command: string) => extractCommandIntent({ data: { command } });

beforeEach(() => {
	mocks.session.mockResolvedValue({ user: { id: "u1" } });
	process.env.GEMINI_API_KEY = "test-key";
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	delete process.env.GEMINI_API_KEY;
});

describe("extractCommandIntent", () => {
	it("returns the validated intent and sends only the command text", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			reply(
				JSON.stringify({
					intent: "account-entry",
					kind: "DEPOSIT",
					amount: "1000",
				}),
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(run("I put another thousand dollars in")).resolves.toEqual({
			intent: "account-entry",
			kind: "DEPOSIT",
			amount: "1000",
		});

		const [, init] = fetchMock.mock.calls[0];
		const body = JSON.parse(init.body);
		expect(body.input).toContain("I put another thousand dollars in");
		expect(init.headers["x-goog-api-key"]).toBe("test-key");
		expect(JSON.stringify(body)).not.toContain("u1");
	});

	it("rejects an unauthenticated caller before calling Gemini", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		mocks.session.mockResolvedValue(null);

		await expect(run("deposit 1000")).rejects.toThrow("Unauthorized");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports a missing key without calling Gemini", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		process.env.GEMINI_API_KEY = "";

		await expect(run("deposit 1000")).rejects.toThrow("not configured");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects an over-long command without calling Gemini", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(run("a".repeat(201))).rejects.toThrow("200 characters");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["a network failure", () => Promise.reject(new Error("offline"))],
		[
			"an error status",
			() => Promise.resolve({ ok: false, json: async () => ({}) }),
		],
		[
			"an empty response",
			() => Promise.resolve({ ok: true, json: async () => ({}) }),
		],
		["malformed JSON", () => Promise.resolve(reply("not json"))],
		[
			"an unsupported route",
			() =>
				Promise.resolve(
					reply(JSON.stringify({ intent: "navigation", path: "/admin" })),
				),
		],
		[
			"an invented entry kind",
			() =>
				Promise.resolve(
					reply(JSON.stringify({ intent: "account-entry", kind: "TRANSFER" })),
				),
		],
	])("throws on %s", async (_label, response) => {
		vi.stubGlobal("fetch", vi.fn().mockImplementation(response));
		await expect(run("do the thing")).rejects.toThrow();
	});
});
