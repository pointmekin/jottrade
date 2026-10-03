import { z } from "zod";
import { calculatePnL } from "./finance";
import { resolveQuoteToAccountConversion } from "./fx";
import { TradeSide } from "./trade";
import { resolveRiskInstrument } from "./trade-risk";
import { ConversionSource, SpecSource } from "./trade-risk-schema";

export const pnlCalculationSnapshotSchema = z.object({
	version: z.literal(1),
	symbol: z.string(),
	side: z.enum(TradeSide),
	entryPrice: z.string(),
	exitPrice: z.string(),
	exitDate: z.string().nullable(),
	quantity: z.string(),
	feesAccount: z.string(),
	instrumentSymbol: z.string(),
	instrumentKind: z.enum(["FOREX", "METAL", "UNIT"]),
	quantityUnit: z.enum(["LOTS", "UNITS"]),
	contractSize: z.string(),
	quoteCurrency: z.string().nullable(),
	accountCurrency: z.string(),
	specSource: z.enum(SpecSource),
	exitQuoteToAccountRate: z.string(),
	exitConversionSource: z.enum(ConversionSource),
	exitConversionAsOf: z.string().nullable(),
	calculatedAt: z.string(),
});
export type PnlCalculationSnapshot = z.infer<
	typeof pnlCalculationSnapshotSchema
>;
export type ManualPnlInput = {
	symbol: string;
	side: TradeSide;
	entryPrice: string;
	exitPrice: string;
	exitDate?: string | null;
	quantity: string;
	fees?: string | null;
	accountCurrency: string;
	exitQuoteToAccountRate?: string | null;
	confirmedUnitQuoteCurrency?: string;
};

function exitConversion(
	input: ManualPnlInput,
	baseCurrency: string | null,
	quoteCurrency: string | null,
) {
	if (!quoteCurrency) {
		if (input.exitQuoteToAccountRate)
			throw new Error(
				"Confirm units and quote currency before supplying exit FX.",
			);
		return { rate: 1, source: ConversionSource.LegacyFallback };
	}
	const conversion = resolveQuoteToAccountConversion({
		baseCurrency: baseCurrency ?? "",
		quoteCurrency,
		accountCurrency: input.accountCurrency,
		instrumentPrice: Number(input.exitPrice),
	});
	if (conversion.type !== "EXTERNAL_REQUIRED") {
		return {
			rate: conversion.rate,
			source:
				conversion.type === "IDENTITY"
					? ConversionSource.Identity
					: ConversionSource.InstrumentPrice,
		};
	}
	const rate = Number(input.exitQuoteToAccountRate);
	if (!Number.isFinite(rate) || rate <= 0)
		throw new Error(
			`Enter an exit FX rate from ${quoteCurrency} to ${input.accountCurrency}. Entry risk FX cannot be reused automatically.`,
		);
	if (!input.exitDate || !Number.isFinite(Date.parse(input.exitDate)))
		throw new Error("Review the exit date for the external exit FX rate.");
	return { rate, source: ConversionSource.UserProvided };
}

export function calculateManualPnl(
	input: ManualPnlInput,
	calculatedAt = new Date().toISOString(),
) {
	const { spec, source } = resolveRiskInstrument(
		input.symbol,
		input.confirmedUnitQuoteCurrency,
	);
	const conversion = exitConversion(
		input,
		spec.baseCurrency,
		spec.quoteCurrency,
	);
	const feesAccount = Number(input.fees || "0");
	const pricesAndQuantity = [
		Number(input.entryPrice),
		Number(input.exitPrice),
		Number(input.quantity),
	];
	if (
		!pricesAndQuantity.every((v) => Number.isFinite(v) && v > 0) ||
		!Number.isFinite(feesAccount) ||
		feesAccount < 0
	)
		throw new Error(
			"P&L requires valid positive prices and quantity, and nonnegative fees.",
		);
	const pnl = calculatePnL({
		side: input.side,
		entryPrice: pricesAndQuantity[0],
		exitPrice: pricesAndQuantity[1],
		quantity: pricesAndQuantity[2],
		contractSize: spec.contractSize,
		entryQuoteToAccountRate: 1,
		exitQuoteToAccountRate: conversion.rate,
		feesAccount,
	});
	if (
		!Number.isFinite(Number(pnl.netPnl)) ||
		!Number.isFinite(Number(pnl.returnPercent))
	)
		throw new Error("P&L exceeds the supported numerical range.");
	const snapshot: PnlCalculationSnapshot = {
		version: 1,
		symbol: input.symbol,
		side: input.side,
		entryPrice: input.entryPrice,
		exitPrice: input.exitPrice,
		exitDate: input.exitDate || null,
		quantity: input.quantity,
		feesAccount: String(feesAccount),
		instrumentSymbol: spec.symbol,
		instrumentKind: spec.kind,
		quantityUnit: spec.quantityUnit,
		contractSize: String(spec.contractSize),
		quoteCurrency: spec.quoteCurrency,
		accountCurrency: input.accountCurrency.toUpperCase(),
		specSource:
			source === SpecSource.Unknown ? SpecSource.LegacyFallback : source,
		exitQuoteToAccountRate: String(conversion.rate),
		exitConversionSource: conversion.source,
		exitConversionAsOf: input.exitDate || null,
		calculatedAt,
	};
	return {
		...pnl,
		pnlCalculationSnapshot: snapshot,
		exitQuoteToAccountRate:
			conversion.source === ConversionSource.UserProvided
				? String(conversion.rate)
				: null,
	};
}
