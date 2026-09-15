import { resolveQuoteToAccountConversion } from "@/lib/fx";
import { resolveInstrumentSpec } from "@/lib/instruments";

export type CurrentFxRate = {
	fromCurrency: string;
	toCurrency: string;
	rate: number;
	provider: "twelve_data" | "frankfurter";
	precision: "INTRADAY" | "DAILY";
	asOf: string;
};

type PositionSizingInput = {
	symbol: string;
	accountCurrency: string;
	balance: number;
	riskPercent: number;
	entryPrice: number;
	stopPrice: number;
	targetPrice?: number;
};

type CalculatePositionSizeInput = PositionSizingInput & {
	quoteToAccountRate: number;
};

type PositionSizingConversion =
	| { type: "IDENTITY"; rate: 1 }
	| { type: "INSTRUMENT_PRICE"; rate: number }
	| ({ type: "CURRENT_RATE" } & CurrentFxRate);

export type PositionSizingResult = {
	riskAmount: number;
	positionSize: number;
	positionUnits: number;
	quantityUnit: "LOTS" | "UNITS";
	stopDistance: number;
	stopDistancePips: number | null;
	rrRatio: number | null;
	conversion?: PositionSizingConversion;
};

type ResolveExternalRate = (input: {
	fromCurrency: string;
	toCurrency: string;
}) => Promise<CurrentFxRate>;

function assertPositive(value: number, label: string) {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a positive number.`);
	}
}

function validateInput(input: PositionSizingInput) {
	if (!input.symbol.trim()) throw new Error("Symbol is required.");
	assertPositive(input.balance, "Account balance");
	assertPositive(input.riskPercent, "Risk percentage");
	assertPositive(input.entryPrice, "Entry price");
	assertPositive(input.stopPrice, "Stop loss");
	if (input.entryPrice === input.stopPrice) {
		throw new Error("Entry price and stop loss must be different.");
	}
	if (
		input.targetPrice !== undefined &&
		(!Number.isFinite(input.targetPrice) || input.targetPrice <= 0)
	) {
		throw new Error("Target price must be a positive number.");
	}
}

export function calculatePositionSize(
	input: CalculatePositionSizeInput,
): PositionSizingResult {
	validateInput(input);
	assertPositive(input.quoteToAccountRate, "Conversion rate");

	const instrument = resolveInstrumentSpec(input.symbol);
	const riskAmount = input.balance * (input.riskPercent / 100);
	const stopDistance = Math.abs(input.entryPrice - input.stopPrice);
	const riskPerPositionUnit =
		stopDistance * instrument.contractSize * input.quoteToAccountRate;
	const positionSize = riskAmount / riskPerPositionUnit;
	const targetPrice = input.targetPrice;

	return {
		riskAmount,
		positionSize,
		positionUnits: positionSize * instrument.contractSize,
		quantityUnit: instrument.quantityUnit,
		stopDistance,
		stopDistancePips: instrument.pipSize
			? stopDistance / instrument.pipSize
			: null,
		rrRatio:
			targetPrice === undefined
				? null
				: Math.abs(targetPrice - input.entryPrice) / stopDistance,
	};
}

export async function sizePosition(
	input: PositionSizingInput,
	resolveExternalRate: ResolveExternalRate,
): Promise<PositionSizingResult> {
	validateInput(input);
	const instrument = resolveInstrumentSpec(input.symbol);
	let conversion: PositionSizingConversion = { type: "IDENTITY", rate: 1 };

	if (instrument.baseCurrency && instrument.quoteCurrency) {
		const local = resolveQuoteToAccountConversion({
			baseCurrency: instrument.baseCurrency,
			quoteCurrency: instrument.quoteCurrency,
			accountCurrency: input.accountCurrency,
			instrumentPrice: input.stopPrice,
		});
		if (local.type === "EXTERNAL_REQUIRED") {
			const current = await resolveExternalRate({
				fromCurrency: local.fromCurrency,
				toCurrency: local.toCurrency,
			});
			conversion = { type: "CURRENT_RATE", ...current };
		} else {
			conversion = local;
		}
	}

	return {
		...calculatePositionSize({
			...input,
			quoteToAccountRate: conversion.rate,
		}),
		conversion,
	};
}
