import { resolveQuoteToAccountConversion } from "./fx";
import { resolveInstrumentSpec } from "./instruments";
import { type Trade, TradeSide, TradeStatus } from "./trade";
import {
	ConversionSource,
	type InitialRiskSnapshot,
	RiskCaptureSource,
	type RiskInputs,
	type RiskPlan,
	RiskUnavailableReason,
	SpecSource,
} from "./trade-risk-schema";

export type RiskCalculationInput = RiskInputs & {
	symbol: string;
	side: TradeSide;
	entryPrice: string;
	quantity: string;
	entryDate: string;
	targetPrice?: string | null;
	accountCurrency: string;
};
const positive = (value: number) => Number.isFinite(value) && value > 0;
export function riskDecimal(value: number) {
	let text = value.toFixed(12);
	if (!text.includes(".")) return text;
	while (text.endsWith("0")) text = text.slice(0, -1);
	if (text.endsWith(".")) return text.slice(0, -1);
	return text;
}

export function resolveRiskInstrument(
	symbol: string,
	confirmedUnitQuoteCurrency?: string,
) {
	const spec = resolveInstrumentSpec(symbol);
	if (spec.quoteCurrency) return { spec, source: SpecSource.Registry };
	if (
		confirmedUnitQuoteCurrency &&
		/^[A-Za-z]{3}$/.test(confirmedUnitQuoteCurrency)
	) {
		return {
			spec: {
				...spec,
				quoteCurrency: confirmedUnitQuoteCurrency.toUpperCase(),
			},
			source: SpecSource.ConfirmedUnits,
		};
	}
	return { spec, source: SpecSource.Unknown };
}

export function resolveRiskConversion(input: RiskCalculationInput) {
	const { spec, source } = resolveRiskInstrument(
		input.symbol,
		input.confirmedUnitQuoteCurrency,
	);
	if (!spec.quoteCurrency)
		return { spec, source, rate: null, conversionSource: null };
	const conversion = resolveQuoteToAccountConversion({
		baseCurrency: spec.baseCurrency ?? "",
		quoteCurrency: spec.quoteCurrency,
		accountCurrency: input.accountCurrency,
		instrumentPrice: Number(input.entryPrice),
	});
	if (conversion.type === "EXTERNAL_REQUIRED") {
		const rate = Number(input.entryQuoteToAccountRate);
		return {
			spec,
			source,
			rate: positive(rate) ? rate : null,
			conversionSource: ConversionSource.UserProvided,
		};
	}
	const conversionSource =
		conversion.type === "IDENTITY"
			? ConversionSource.Identity
			: ConversionSource.InstrumentPrice;
	return { spec, source, rate: conversion.rate, conversionSource };
}

export function validateInitialStop(
	side: TradeSide,
	entryPrice: string,
	stopPrice?: string,
) {
	if (!stopPrice) return;
	const entry = Number(entryPrice);
	const stop = Number(stopPrice);
	if (!positive(entry) || !positive(stop))
		throw new Error("Entry and initial stop must be positive.");
	const wrongSide = side === TradeSide.Long ? stop >= entry : stop <= entry;
	if (wrongSide)
		throw new Error(
			"Initial stop must be below entry for a long and above entry for a short.",
		);
}

function missingRiskReason(
	input: RiskCalculationInput,
	rate: number | null,
	quoteCurrency: string | null,
) {
	if (!input.initialStopPrice) return RiskUnavailableReason.MissingStop;
	if (!positive(Number(input.entryPrice)) || !positive(Number(input.quantity)))
		return RiskUnavailableReason.InvalidInput;
	if (!quoteCurrency) return RiskUnavailableReason.UnknownSpec;
	if (rate === null) return RiskUnavailableReason.MissingFx;
	return null;
}

export function calculateInitialRisk(
	input: RiskCalculationInput,
	capturedAt = new Date().toISOString(),
): RiskPlan {
	validateInitialStop(input.side, input.entryPrice, input.initialStopPrice);
	const context = riskContext(input);
	const { spec, rate, source, conversionSource } = context;
	const reason = missingRiskReason(input, rate, spec.quoteCurrency);
	const amount = initialRiskAmount(input, rate, spec.contractSize, reason);
	const balance = Number(input.balanceAccount);
	const percent =
		amount !== null && positive(balance) ? (amount / balance) * 100 : null;
	const snapshot: InitialRiskSnapshot = {
		version: 1,
		symbol: input.symbol,
		side: input.side,
		entryDate: input.entryDate,
		entryPrice: input.entryPrice,
		quantity: input.quantity,
		stopPrice: input.initialStopPrice || null,
		targetPrice: input.targetPrice || null,
		instrumentSymbol: spec.symbol,
		instrumentKind: spec.kind,
		quantityUnit: spec.quantityUnit,
		contractSize: String(spec.contractSize),
		quoteCurrency: spec.quoteCurrency,
		accountCurrency: input.accountCurrency.toUpperCase(),
		specSource: source,
		quoteToAccountRate: rate === null ? null : riskDecimal(rate),
		conversionSource,
		conversionAsOf: rate === null ? null : input.entryDate,
		balanceAccount: input.balanceAccount || null,
		balanceAsOf: input.balanceAccount ? input.entryDate : null,
		balanceSource: input.balanceAccount ? "USER_REVIEWED" : null,
		riskBasis: "PRICE_DISTANCE",
		estimatedCostsIncluded: false,
		captureSource: input.captureSource ?? RiskCaptureSource.Manual,
		capturedAt,
		unavailableReason:
			reason ?? (amount === null ? RiskUnavailableReason.InvalidInput : null),
	};
	return {
		initialStopPrice: snapshot.stopPrice,
		initialTargetPrice: snapshot.targetPrice,
		initialRiskSnapshot: snapshot,
		initialRiskAmount: amount === null ? null : riskDecimal(amount),
		initialRiskPercent:
			percent !== null && Number.isFinite(percent)
				? riskDecimal(percent)
				: null,
	};
}

export function calculatePositionSize(
	input: Omit<RiskCalculationInput, "quantity">,
	requestedRisk: number,
) {
	const unitRisk = calculateInitialRisk({ ...input, quantity: "1" });
	const risk = Number(unitRisk.initialRiskAmount);
	if (!positive(requestedRisk) || !positive(risk)) return null;
	const quantity = requestedRisk / risk;
	if (!positive(quantity)) return null;
	const rounded = riskDecimal(quantity);
	return positive(Number(rounded)) ? rounded : null;
}

export function calculatePlannedRewardRisk(
	snapshot?: InitialRiskSnapshot | null,
) {
	if (!snapshot?.stopPrice || !snapshot.targetPrice) return null;
	const direction = snapshot.side === TradeSide.Long ? 1 : -1;
	const reward =
		(Number(snapshot.targetPrice) - Number(snapshot.entryPrice)) * direction;
	const risk =
		(Number(snapshot.entryPrice) - Number(snapshot.stopPrice)) * direction;
	if (!positive(risk) || !positive(reward)) return null;
	return reward / risk;
}

export function calculateRealizedR(
	trade: Pick<
		Trade,
		"status" | "netPnl" | "initialRiskAmount" | "initialRiskSnapshot"
	>,
	accountCurrency?: string,
) {
	if (
		trade.status !== TradeStatus.Closed ||
		trade.netPnl === null ||
		trade.netPnl === ""
	)
		return null;
	if (
		accountCurrency &&
		trade.initialRiskSnapshot?.accountCurrency !== accountCurrency
	)
		return null;
	const risk = Number(trade.initialRiskAmount);
	const pnl = Number(trade.netPnl);
	if (!positive(risk) || !Number.isFinite(pnl)) return null;
	return pnl / risk;
}

function initialRiskAmount(
	input: RiskCalculationInput,
	rate: number | null,
	contractSize: number,
	reason: string | null,
) {
	if (reason !== null || rate === null) return null;
	const amount =
		Math.abs(Number(input.entryPrice) - Number(input.initialStopPrice)) *
		Number(input.quantity) *
		contractSize *
		rate;
	if (!positive(amount) || !positive(Number(riskDecimal(amount)))) return null;
	return amount;
}

function riskContext(input: RiskCalculationInput) {
	if (positive(Number(input.entryPrice))) return resolveRiskConversion(input);
	return {
		...resolveRiskInstrument(input.symbol, input.confirmedUnitQuoteCurrency),
		rate: null,
		conversionSource: null,
	};
}
