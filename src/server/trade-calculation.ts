import { calculatePnL } from "@/lib/finance";
import { resolveQuoteToAccountConversion } from "@/lib/fx";
import { resolveInstrumentSpec } from "@/lib/instruments";
import type { FxRateResult, ResolveFxRateInput } from "./fx/types";

export type ConversionSource =
	| "IDENTITY"
	| "INSTRUMENT_PRICE"
	| "TWELVE_DATA"
	| "FRANKFURTER"
	| "BROKER_REPORTED";

export type StoredTradeCalculation = {
	quantityUnit: string | null;
	contractSize: string | null;
	baseCurrency: string | null;
	quoteCurrency: string | null;
	pnlCurrency: string | null;
	entryConversionRate: string | null;
	entryConversionSource: string | null;
	entryConversionAsOf: Date | null;
	exitConversionRate: string | null;
	exitConversionSource: string | null;
	exitConversionAsOf: Date | null;
};

export type TradeCalculationInput = {
	symbol: string;
	side: "LONG" | "SHORT";
	entryDate: Date;
	exitDate: Date | null;
	entryPrice: string | number | null;
	exitPrice: string | number | null;
	quantity: string | number | null;
	fees: string | number | null;
};

type ConversionLeg = {
	rate: number;
	source: Exclude<ConversionSource, "BROKER_REPORTED">;
	asOf: Date;
};

type ResolveExternalRate = (input: ResolveFxRateInput) => Promise<FxRateResult>;

type CalculationOptions = {
	trade: TradeCalculationInput;
	accountCurrency: string;
	resolveExternalRate: ResolveExternalRate;
	reuse?: { entry?: ConversionLeg; exit?: ConversionLeg };
};

const PNL_FIELDS = new Set([
	"symbol",
	"side",
	"entryDate",
	"exitDate",
	"entryPrice",
	"exitPrice",
	"quantity",
	"fees",
	"portfolioId",
]);

function externalSource(
	provider: FxRateResult["provider"],
): Exclude<ConversionSource, "BROKER_REPORTED"> {
	return provider === "twelve_data" ? "TWELVE_DATA" : "FRANKFURTER";
}

function storedLeg(
	rate: string | null,
	source: string | null,
	asOf: Date | null,
): ConversionLeg | undefined {
	const numericRate = Number(rate);
	if (
		!Number.isFinite(numericRate) ||
		numericRate <= 0 ||
		!asOf ||
		(source !== "IDENTITY" &&
			source !== "INSTRUMENT_PRICE" &&
			source !== "TWELVE_DATA" &&
			source !== "FRANKFURTER")
	) {
		return undefined;
	}
	return { rate: numericRate, source, asOf };
}

function sameDate(left: Date | null, right: Date | null): boolean {
	return left?.getTime() === right?.getTime();
}

export async function calculateTradeSnapshot({
	trade,
	accountCurrency,
	resolveExternalRate,
	reuse = {},
}: CalculationOptions) {
	const instrument = resolveInstrumentSpec(trade.symbol);
	const normalizedAccountCurrency = accountCurrency.toUpperCase();
	const externalRates = new Map<string, Promise<FxRateResult>>();

	async function resolveLeg(
		priceValue: string | number | null,
		at: Date | null,
	): Promise<ConversionLeg | undefined> {
		if (priceValue === null || at === null) return undefined;
		const price = Number(priceValue);
		if (!Number.isFinite(price) || price <= 0) return undefined;

		if (!instrument.baseCurrency || !instrument.quoteCurrency) {
			return { rate: 1, source: "IDENTITY", asOf: at };
		}

		const local = resolveQuoteToAccountConversion({
			baseCurrency: instrument.baseCurrency,
			quoteCurrency: instrument.quoteCurrency,
			accountCurrency: normalizedAccountCurrency,
			instrumentPrice: price,
		});
		if (local.type !== "EXTERNAL_REQUIRED") {
			return { rate: local.rate, source: local.type, asOf: at };
		}

		const minute = new Date(at);
		minute.setUTCSeconds(0, 0);
		const key = `${local.fromCurrency}/${local.toCurrency}/${minute.toISOString()}`;
		let pending = externalRates.get(key);
		if (!pending) {
			pending = resolveExternalRate({
				fromCurrency: local.fromCurrency,
				toCurrency: local.toCurrency,
				at,
				mode: "HISTORICAL",
			});
			externalRates.set(key, pending);
		}
		const external = await pending;
		return {
			rate: external.rate,
			source: externalSource(external.provider),
			asOf: external.asOf,
		};
	}

	const entry =
		reuse.entry ?? (await resolveLeg(trade.entryPrice, trade.entryDate));
	const exit =
		reuse.exit ?? (await resolveLeg(trade.exitPrice, trade.exitDate));
	const snapshot: StoredTradeCalculation = {
		quantityUnit: instrument.quantityUnit,
		contractSize: String(instrument.contractSize),
		baseCurrency: instrument.baseCurrency,
		quoteCurrency: instrument.quoteCurrency,
		pnlCurrency: normalizedAccountCurrency,
		entryConversionRate: entry ? String(entry.rate) : null,
		entryConversionSource: entry?.source ?? null,
		entryConversionAsOf: entry?.asOf ?? null,
		exitConversionRate: exit ? String(exit.rate) : null,
		exitConversionSource: exit?.source ?? null,
		exitConversionAsOf: exit?.asOf ?? null,
	};

	if (!entry || !exit || trade.quantity === null) {
		return { snapshot, netPnl: undefined, returnPercent: undefined };
	}

	const pnl = calculatePnL({
		side: trade.side,
		entryPrice: Number(trade.entryPrice),
		exitPrice: Number(trade.exitPrice),
		quantity: Number(trade.quantity),
		contractSize: instrument.contractSize,
		entryQuoteToAccountRate: entry.rate,
		exitQuoteToAccountRate: exit.rate,
		feesAccount: Number(trade.fees ?? 0),
	});
	return { snapshot, ...pnl };
}

type UpdateInput = {
	existing: TradeCalculationInput &
		StoredTradeCalculation & {
			importHash: string | null;
			portfolioId?: number;
		};
	patch: Partial<TradeCalculationInput> & {
		portfolioId?: number;
		notes?: string;
		confidence?: string;
		mistake?: string;
		setupId?: number | null;
	};
	accountCurrency: string;
	resolveExternalRate: ResolveExternalRate;
};

export async function prepareTradeUpdate({
	existing,
	patch,
	accountCurrency,
	resolveExternalRate,
}: UpdateInput) {
	if (existing.importHash !== null) return null;
	if (!Object.keys(patch).some((field) => PNL_FIELDS.has(field))) return null;

	const effective = { ...existing, ...patch };
	const symbolChanged =
		patch.symbol !== undefined && patch.symbol !== existing.symbol;
	const portfolioChanged =
		patch.portfolioId !== undefined &&
		patch.portfolioId !== existing.portfolioId;
	const entryDateChanged =
		patch.entryDate !== undefined &&
		!sameDate(patch.entryDate, existing.entryDate);
	const exitDateChanged =
		patch.exitDate !== undefined &&
		!sameDate(patch.exitDate, existing.exitDate);
	const entryPriceChanged =
		patch.entryPrice !== undefined && patch.entryPrice !== existing.entryPrice;
	const exitPriceChanged =
		patch.exitPrice !== undefined && patch.exitPrice !== existing.exitPrice;

	let entry = storedLeg(
		existing.entryConversionRate,
		existing.entryConversionSource,
		existing.entryConversionAsOf,
	);
	let exit = storedLeg(
		existing.exitConversionRate,
		existing.exitConversionSource,
		existing.exitConversionAsOf,
	);
	if (
		symbolChanged ||
		portfolioChanged ||
		entryDateChanged ||
		(entryPriceChanged && existing.entryConversionSource === "INSTRUMENT_PRICE")
	) {
		entry = undefined;
	}
	if (
		symbolChanged ||
		portfolioChanged ||
		exitDateChanged ||
		(exitPriceChanged && existing.exitConversionSource === "INSTRUMENT_PRICE")
	) {
		exit = undefined;
	}

	return calculateTradeSnapshot({
		trade: effective,
		accountCurrency,
		resolveExternalRate,
		reuse: { entry, exit },
	});
}
