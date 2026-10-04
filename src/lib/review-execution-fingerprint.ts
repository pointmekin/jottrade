import { sha256Hex } from "./hash";

const EXECUTION_KEYS = [
	"symbol",
	"side",
	"status",
	"entryDate",
	"exitDate",
	"entryPrice",
	"exitPrice",
	"quantity",
	"netPnl",
	"fees",
	"targetPrice",
	"initialStopPrice",
	"initialTargetPrice",
	"initialRiskAmount",
	"initialRiskPercent",
	"managementStopPrice",
	"exitQuoteToAccountRate",
];
const RISK_KEYS = [
	"version",
	"symbol",
	"side",
	"entryDate",
	"entryPrice",
	"quantity",
	"stopPrice",
	"targetPrice",
	"instrumentSymbol",
	"instrumentKind",
	"quantityUnit",
	"contractSize",
	"quoteCurrency",
	"accountCurrency",
	"specSource",
	"quoteToAccountRate",
	"conversionSource",
	"conversionAsOf",
	"balanceAccount",
	"balanceAsOf",
	"balanceSource",
	"riskBasis",
	"estimatedCostsIncluded",
	"unavailableReason",
];
export function canonicalReviewValue(value: unknown): unknown {
	if (value == null) return null;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
		let text = value.replace(/^(-?)0+(?=\d)/, "$1");
		if (text.includes(".")) {
			let end = text.length;
			while (text[end - 1] === "0") end--;
			if (text[end - 1] === ".") end--;
			text = text.slice(0, end);
		}
		return text === "-0" ? "0" : text;
	}
	return value;
}
function project(record: object, keys: string[]) {
	const values = record as Record<string, unknown>;
	return keys.map((key) => [key, canonicalReviewValue(values[key])]);
}

const PNL_KEYS = [
	"version",
	"symbol",
	"side",
	"entryPrice",
	"exitPrice",
	"exitDate",
	"quantity",
	"feesAccount",
	"instrumentSymbol",
	"instrumentKind",
	"quantityUnit",
	"contractSize",
	"quoteCurrency",
	"accountCurrency",
	"specSource",
	"exitQuoteToAccountRate",
	"exitConversionSource",
	"exitConversionAsOf",
];
export type ReviewSemanticValues = Record<
	string,
	string | number | boolean | null
>;
export type ReviewExecutionFacts = {
	execution: ReviewSemanticValues;
	risk: ReviewSemanticValues | null;
	pnlContext: ReviewSemanticValues | null;
};
function semanticValues(record: object, keys: string[]): ReviewSemanticValues {
	const values = record as Record<string, unknown>;
	return Object.fromEntries(
		keys.map((key) => {
			const value = canonicalReviewValue(values[key]);
			if (
				typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean"
			)
				return [key, value];
			return [key, null];
		}),
	);
}
function context(record: object, name: string, keys: string[]) {
	const value = (record as Record<string, unknown>)[name];
	return typeof value === "object" && value !== null
		? semanticValues(value, keys)
		: null;
}
export function reviewExecutionFacts(trade: object): ReviewExecutionFacts {
	return {
		execution: semanticValues(trade, EXECUTION_KEYS),
		risk: context(trade, "initialRiskSnapshot", RISK_KEYS),
		pnlContext: context(trade, "pnlCalculationSnapshot", PNL_KEYS),
	};
}
export function reviewCashFlowFacts(flow: object) {
	return context(flow, "brokerAdjustment", [
		"symbol",
		"type",
		"lots",
		"positionId",
		"exDate",
		"adjustmentDay",
		"occurredAt",
		"dividendRate",
		"amount",
		"amountDecimal",
	]);
}
export async function currentExecutionFingerprint(trade: object) {
	return `review-v2:${await sha256Hex(JSON.stringify(reviewExecutionFacts(trade)))}`;
}
export async function currentCashFlowFingerprint(flow: object) {
	return `flow-v2:${await sha256Hex(JSON.stringify([project(flow, ["kind", "occurredAt", "amount"]), reviewCashFlowFacts(flow)]))}`;
}
