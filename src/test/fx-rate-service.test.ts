import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createFxRateResolver,
	type FxRateCacheStore,
	resolveFxConfig,
} from "@/server/fx/fx-rate-service";

function response(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function memoryCache(): FxRateCacheStore {
	const values = new Map<string, Parameters<FxRateCacheStore["put"]>[0]>();
	const key = (value: {
		provider: string;
		fromCurrency: string;
		toCurrency: string;
		rateKey: string;
	}) =>
		[value.provider, value.fromCurrency, value.toCurrency, value.rateKey].join(
			"|",
		);

	return {
		get: vi.fn(async (query) => values.get(key(query)) ?? null),
		put: vi.fn(async (value) => {
			values.set(key(value), value);
		}),
	};
}

const historicalRequest = {
	fromCurrency: "jpy",
	toCurrency: "usd",
	at: new Date("2026-09-15T08:32:47.000Z"),
	mode: "HISTORICAL" as const,
};

describe("FX rate configuration", () => {
	it("uses Twelve Data with Frankfurter fallback by default", () => {
		expect(resolveFxConfig({ TWELVE_DATA_API_KEY: "secret" })).toEqual({
			primaryProvider: "twelve_data",
			fallbackProvider: "frankfurter",
			twelveDataApiKey: "secret",
			currentCacheMinutes: 5,
		});
	});

	it("supports Frankfurter as primary and disables fallback", () => {
		expect(
			resolveFxConfig({
				FX_RATE_PROVIDER: "frankfurter",
				FX_RATE_FALLBACK_PROVIDER: "none",
				FX_RATE_CURRENT_CACHE_MINUTES: "10",
			}),
		).toMatchObject({
			primaryProvider: "frankfurter",
			fallbackProvider: null,
			currentCacheMinutes: 10,
		});
	});

	it("rejects unsupported provider settings", () => {
		expect(() => resolveFxConfig({ FX_RATE_PROVIDER: "other" })).toThrow(
			"Unsupported FX_RATE_PROVIDER",
		);
	});
});

describe("resolveFxRate", () => {
	afterEach(() => vi.useRealTimers());

	it("sends Twelve Data the UTC minute and parses the rate", async () => {
		const fetchFn = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				response({ rate: 0.00712345, timestamp: 1789461120 }),
		);
		const resolveFxRate = createFxRateResolver({
			cache: memoryCache(),
			fetchFn,
			env: { TWELVE_DATA_API_KEY: "server-secret" },
		});

		const result = await resolveFxRate(historicalRequest);

		const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
		expect(url.origin + url.pathname).toBe(
			"https://api.twelvedata.com/exchange_rate",
		);
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			symbol: "JPY/USD",
			date: "2026-09-15T08:32:00",
			timezone: "UTC",
			dp: "8",
			apikey: "server-secret",
		});
		expect(result).toMatchObject({
			fromCurrency: "JPY",
			toCurrency: "USD",
			rate: 0.00712345,
			provider: "twelve_data",
			precision: "INTRADAY",
		});
	});

	it("does not retry a Twelve Data 429 and falls back once", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(response({ message: "rate limit" }, 429))
			.mockResolvedValueOnce(
				response({
					date: "2026-09-15",
					base: "JPY",
					quote: "USD",
					rate: 0.007,
				}),
			);
		const resolveFxRate = createFxRateResolver({
			cache: memoryCache(),
			fetchFn,
			env: { TWELVE_DATA_API_KEY: "secret" },
		});

		const result = await resolveFxRate(historicalRequest);

		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(String(fetchFn.mock.calls[1]?.[0])).toContain(
			"api.frankfurter.dev/v2/rate/JPY/USD?date=2026-09-15",
		);
		expect(result).toMatchObject({
			provider: "frankfurter",
			precision: "DAILY",
			rate: 0.007,
		});
	});

	it("uses Frankfurter when the Twelve Data key is missing", async () => {
		const fetchFn = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				response({
					date: "2026-09-15",
					base: "JPY",
					quote: "USD",
					rate: 0.007,
				}),
		);
		const resolveFxRate = createFxRateResolver({
			cache: memoryCache(),
			fetchFn,
			env: {},
		});

		await expect(resolveFxRate(historicalRequest)).resolves.toMatchObject({
			provider: "frankfurter",
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(String(fetchFn.mock.calls[0]?.[0])).toContain("api.frankfurter.dev");
	});

	it.each([
		{ label: "missing rate", payload: { timestamp: 1789461120 } },
		{ label: "zero rate", payload: { rate: 0, timestamp: 1789461120 } },
		{
			label: "provider error",
			payload: { status: "error", message: "bad key" },
		},
		{ label: "invalid timestamp", payload: { rate: 0.007, timestamp: "nope" } },
	])(
		"falls back for an invalid Twelve Data $label response",
		async ({ payload }) => {
			const fetchFn = vi
				.fn()
				.mockResolvedValueOnce(response(payload))
				.mockResolvedValueOnce(
					response({
						date: "2026-09-15",
						base: "JPY",
						quote: "USD",
						rate: 0.007,
					}),
				);
			const resolveFxRate = createFxRateResolver({
				cache: memoryCache(),
				fetchFn,
				env: { TWELVE_DATA_API_KEY: "secret" },
			});

			await expect(resolveFxRate(historicalRequest)).resolves.toMatchObject({
				provider: "frankfurter",
			});
			expect(fetchFn).toHaveBeenCalledTimes(2);
		},
	);

	it("falls back after the Twelve Data request times out", async () => {
		vi.useFakeTimers();
		const fetchFn = vi
			.fn()
			.mockImplementationOnce(
				(_url: string, init?: RequestInit) =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () =>
							reject(new DOMException("Aborted", "AbortError")),
						);
					}),
			)
			.mockResolvedValueOnce(
				response({
					date: "2026-09-15",
					base: "JPY",
					quote: "USD",
					rate: 0.007,
				}),
			);
		const resolveFxRate = createFxRateResolver({
			cache: memoryCache(),
			fetchFn,
			env: { TWELVE_DATA_API_KEY: "secret" },
			timeoutMs: 5_000,
		});

		const pending = resolveFxRate(historicalRequest);
		await vi.advanceTimersByTimeAsync(5_000);

		await expect(pending).resolves.toMatchObject({ provider: "frankfurter" });
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it("reuses a persistent cache entry for an identical historical minute", async () => {
		const cache = memoryCache();
		const fetchFn = vi.fn(async () =>
			response({ rate: 0.00712345, timestamp: 1789461120 }),
		);
		const resolveFxRate = createFxRateResolver({
			cache,
			fetchFn,
			env: { TWELVE_DATA_API_KEY: "secret" },
		});

		const first = await resolveFxRate(historicalRequest);
		const second = await resolveFxRate({
			...historicalRequest,
			at: new Date("2026-09-15T08:32:01.000Z"),
		});

		expect(second).toEqual(first);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(cache.put).toHaveBeenCalledTimes(1);
	});

	it("uses configurable buckets for current rates", async () => {
		const cache = memoryCache();
		const fetchFn = vi.fn(async () =>
			response({ rate: 0.00712345, timestamp: 1789461120 }),
		);
		const resolveFxRate = createFxRateResolver({
			cache,
			fetchFn,
			env: {
				TWELVE_DATA_API_KEY: "secret",
				FX_RATE_CURRENT_CACHE_MINUTES: "10",
			},
		});

		await resolveFxRate({ ...historicalRequest, mode: "CURRENT" });
		await resolveFxRate({
			...historicalRequest,
			mode: "CURRENT",
			at: new Date("2026-09-15T08:39:59.000Z"),
		});

		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(cache.get).toHaveBeenLastCalledWith(
			expect.objectContaining({ rateKey: "current:2026-09-15T08:30Z" }),
		);
	});

	it("throws a domain error when both providers fail", async () => {
		const fetchFn = vi.fn(async () => response({ message: "down" }, 503));
		const resolveFxRate = createFxRateResolver({
			cache: memoryCache(),
			fetchFn,
			env: { TWELVE_DATA_API_KEY: "secret" },
		});

		await expect(resolveFxRate(historicalRequest)).rejects.toThrow(
			"Currency conversion rate is unavailable",
		);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});
});
