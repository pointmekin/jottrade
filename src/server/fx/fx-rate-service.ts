import type {
	FxProvider,
	FxRateMode,
	FxRatePrecision,
	FxRateResult,
	ResolveFxRateInput,
} from "./types";

export type FxRateCacheEntry = FxRateResult & {
	rateKey: string;
};

export type FxRateCacheQuery = Pick<
	FxRateCacheEntry,
	"provider" | "fromCurrency" | "toCurrency" | "rateKey"
>;

export type FxRateCacheStore = {
	get(query: FxRateCacheQuery): Promise<FxRateCacheEntry | null>;
	put(entry: FxRateCacheEntry): Promise<void>;
};

type FxEnvironment = Record<string, string | undefined>;

export type FxConfig = {
	primaryProvider: FxProvider;
	fallbackProvider: FxProvider | null;
	twelveDataApiKey: string | undefined;
	currentCacheMinutes: number;
};

type ResolverDependencies = {
	cache: FxRateCacheStore;
	fetchFn?: typeof fetch;
	env?: FxEnvironment;
	timeoutMs?: number;
};

const DOMAIN_ERROR =
	"Currency conversion rate is unavailable. Try again later or enter broker-reported P&L.";

function parseProvider(value: string | undefined): FxProvider {
	const normalized = value?.trim().toLowerCase() || "twelve_data";
	if (normalized === "twelve_data" || normalized === "frankfurter") {
		return normalized;
	}
	throw new Error(`Unsupported FX_RATE_PROVIDER: ${value}`);
}

export function resolveFxConfig(env: FxEnvironment): FxConfig {
	const primaryProvider = parseProvider(env.FX_RATE_PROVIDER);
	const fallbackValue =
		env.FX_RATE_FALLBACK_PROVIDER?.trim().toLowerCase() || "frankfurter";
	if (fallbackValue !== "none" && fallbackValue !== "frankfurter") {
		throw new Error(
			`Unsupported FX_RATE_FALLBACK_PROVIDER: ${env.FX_RATE_FALLBACK_PROVIDER}`,
		);
	}

	const configuredMinutes = Number(env.FX_RATE_CURRENT_CACHE_MINUTES ?? "5");
	if (!Number.isInteger(configuredMinutes) || configuredMinutes <= 0) {
		throw new Error("FX_RATE_CURRENT_CACHE_MINUTES must be a positive integer");
	}

	return {
		primaryProvider,
		fallbackProvider: fallbackValue === "none" ? null : fallbackValue,
		twelveDataApiKey: env.TWELVE_DATA_API_KEY?.trim() || undefined,
		currentCacheMinutes: configuredMinutes,
	};
}

function minuteStart(at: Date): Date {
	const result = new Date(at);
	result.setUTCSeconds(0, 0);
	return result;
}

function currentBucketStart(at: Date, bucketMinutes: number): Date {
	const result = minuteStart(at);
	result.setUTCMinutes(
		Math.floor(result.getUTCMinutes() / bucketMinutes) * bucketMinutes,
	);
	return result;
}

function minuteKey(at: Date): string {
	return `${at.toISOString().slice(0, 16)}Z`;
}

function rateKey(
	provider: FxProvider,
	mode: FxRateMode,
	at: Date,
	currentCacheMinutes: number,
): string {
	if (mode === "CURRENT") {
		return `current:${minuteKey(currentBucketStart(at, currentCacheMinutes))}`;
	}
	if (provider === "frankfurter") {
		return `historical:${at.toISOString().slice(0, 10)}`;
	}
	return `historical:${minuteKey(minuteStart(at))}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function positiveRate(value: unknown): number {
	const rate = typeof value === "string" ? Number(value) : value;
	if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
		throw new Error("FX provider returned an invalid rate");
	}
	return rate;
}

function parseTimestamp(value: unknown): Date {
	const parsed =
		typeof value === "number"
			? new Date(value * 1000)
			: typeof value === "string"
				? new Date(value)
				: new Date(Number.NaN);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error("FX provider returned an invalid timestamp");
	}
	return parsed;
}

async function requestJson(
	url: URL,
	fetchFn: typeof fetch,
	timeoutMs: number,
): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchFn(url, { signal: controller.signal });
		if (!response.ok) throw new Error(`FX provider HTTP ${response.status}`);
		return await response.json();
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchTwelveDataRate(
	input: ResolveFxRateInput,
	config: FxConfig,
	fetchFn: typeof fetch,
	timeoutMs: number,
): Promise<FxRateResult> {
	if (!config.twelveDataApiKey) {
		throw new Error("TWELVE_DATA_API_KEY is not configured");
	}

	const fromCurrency = input.fromCurrency.toUpperCase();
	const toCurrency = input.toCurrency.toUpperCase();
	const url = new URL("https://api.twelvedata.com/exchange_rate");
	url.searchParams.set("symbol", `${fromCurrency}/${toCurrency}`);
	if (input.mode === "HISTORICAL") {
		url.searchParams.set(
			"date",
			minuteStart(input.at).toISOString().slice(0, 19),
		);
	}
	url.searchParams.set("timezone", "UTC");
	url.searchParams.set("dp", "8");
	url.searchParams.set("apikey", config.twelveDataApiKey);

	const payload = await requestJson(url, fetchFn, timeoutMs);
	if (
		!isRecord(payload) ||
		payload.status === "error" ||
		(payload.symbol !== undefined &&
			payload.symbol !== `${fromCurrency}/${toCurrency}`)
	) {
		throw new Error("Twelve Data returned an invalid response");
	}

	return {
		fromCurrency,
		toCurrency,
		rate: positiveRate(payload.rate),
		provider: "twelve_data",
		asOf: parseTimestamp(payload.timestamp),
		precision: "INTRADAY",
	};
}

async function fetchFrankfurterRate(
	input: ResolveFxRateInput,
	fetchFn: typeof fetch,
	timeoutMs: number,
): Promise<FxRateResult> {
	const fromCurrency = input.fromCurrency.toUpperCase();
	const toCurrency = input.toCurrency.toUpperCase();
	const url = new URL(
		`https://api.frankfurter.dev/v2/rate/${fromCurrency}/${toCurrency}`,
	);
	if (input.mode === "HISTORICAL") {
		url.searchParams.set("date", input.at.toISOString().slice(0, 10));
	}

	const payload = await requestJson(url, fetchFn, timeoutMs);
	if (
		!isRecord(payload) ||
		payload.base !== fromCurrency ||
		payload.quote !== toCurrency
	) {
		throw new Error("Frankfurter returned an invalid response");
	}
	const date = parseTimestamp(
		typeof payload.date === "string" ? `${payload.date}T00:00:00.000Z` : null,
	);

	return {
		fromCurrency,
		toCurrency,
		rate: positiveRate(payload.rate),
		provider: "frankfurter",
		asOf: date,
		precision: "DAILY",
	};
}

async function fetchProviderRate(
	provider: FxProvider,
	input: ResolveFxRateInput,
	config: FxConfig,
	fetchFn: typeof fetch,
	timeoutMs: number,
): Promise<FxRateResult> {
	return provider === "twelve_data"
		? fetchTwelveDataRate(input, config, fetchFn, timeoutMs)
		: fetchFrankfurterRate(input, fetchFn, timeoutMs);
}

export function createFxRateResolver({
	cache,
	fetchFn = fetch,
	env = process.env,
	timeoutMs = 5_000,
}: ResolverDependencies) {
	const config = resolveFxConfig(env);

	return async function resolveFxRate(
		input: ResolveFxRateInput,
	): Promise<FxRateResult> {
		if (Number.isNaN(input.at.getTime()))
			throw new Error("Invalid FX rate date");

		const normalizedInput = {
			...input,
			fromCurrency: input.fromCurrency.toUpperCase(),
			toCurrency: input.toCurrency.toUpperCase(),
		};
		const providers = [config.primaryProvider, config.fallbackProvider].filter(
			(provider, index, all): provider is FxProvider =>
				provider !== null && all.indexOf(provider) === index,
		);

		for (const provider of providers) {
			const key = rateKey(
				provider,
				normalizedInput.mode,
				normalizedInput.at,
				config.currentCacheMinutes,
			);
			const query = {
				provider,
				fromCurrency: normalizedInput.fromCurrency,
				toCurrency: normalizedInput.toCurrency,
				rateKey: key,
			};
			const cached = await cache.get(query);
			if (cached) {
				const { rateKey: _rateKey, ...result } = cached;
				return result;
			}

			try {
				const result = await fetchProviderRate(
					provider,
					normalizedInput,
					config,
					fetchFn,
					timeoutMs,
				);
				await cache.put({ ...result, rateKey: key });
				return result;
			} catch {}
		}

		throw new Error(DOMAIN_ERROR);
	};
}

export type { FxProvider, FxRatePrecision, FxRateResult, ResolveFxRateInput };
