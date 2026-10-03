import { TradeSide } from "@/lib/trade";
import { validateInitialStop } from "@/lib/trade-risk";
import { resolveCommandSymbol } from "../aliases";
import { correctTypos } from "../fuzzy";
import { type CommandCandidate, IntentType, type TradeParams } from "../types";

// The lookbehind keeps a minus sign attached, so a negative number never matches.
const number = "(?<![\\w.-])(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?![\\w.])";
const connector = "\\s*(?:of|at|@|[:=])?\\s*";
const bareNumber = new RegExp(`^${number}$`);

const vocabulary = [
	"buy",
	"sell",
	"long",
	"short",
	"entry",
	"target",
	"stop",
	"loss",
	"take",
	"profit",
	"price",
	"lot",
	"lots",
	"size",
	"qty",
	"quantity",
	"volume",
	"units",
	"shares",
	"from",
] as const;
const leadInPhrases = [
	"i\\s+(?:want|would\\s+like|wanna|need)\\s+to",
	"please",
	"let'?s",
	"log",
	"add",
	"open",
	"new",
	"a",
];
const leadIn = new RegExp(`^(?:(?:${leadInPhrases.join("|")})\\s+)+`, "i");

const stopPatterns = [
	`\\b(?:stop(?:\\s+loss)?|sl)(?:\\s+price)?${connector}(${number})`,
];
const targetPatterns = [
	`\\b(?:target|tp|take\\s+profit)(?:\\s+price)?${connector}(${number})`,
];
const quantityPatterns = [
	`\\b(?:lot\\s+size|position\\s+size|size|qty|quantity|volume|lots?)${connector}(${number})`,
	`(${number})\\s*(?:lots?|units?|shares?)(?:\\s+size)?(?=\\s|,|$)`,
];
const entryPatterns = [
	`(?:\\b(?:entry|from|at)(?:\\s+price)?|@)${connector}(${number})`,
];
/** A label that keeps no number of its own carries no value. Drop it. */
const labelNoise =
	/\b(?:entry|target|tp|take|profit|price|lots?|size|qty|quantity|volume|units|shares|with|and|at|from)\b/gi;

/**
 * An unlabelled second price is only a target when it sits on the profit side
 * of the entry and stays near it. This rejects a stray number such as a date.
 */
const TARGET_RATIO_RANGE = [0.5, 2] as const;

function take(rest: string, patterns: string[]) {
	for (const pattern of patterns) {
		const regex = new RegExp(pattern, "i");
		const match = regex.exec(rest);
		if (match) return { value: match[1], rest: rest.replace(regex, " ") };
	}
	return { value: undefined, rest };
}

const isPositive = (value: number) => value > 0;

function isPlausibleTarget(
	entryPrice: string,
	targetPrice: string,
	side: TradeParams["side"],
): boolean {
	const entry = Number(entryPrice);
	const target = Number(targetPrice);
	if (!isPositive(entry) || !isPositive(target)) return false;
	const ratio = target / entry;
	if (ratio < TARGET_RATIO_RANGE[0] || ratio > TARGET_RATIO_RANGE[1])
		return false;
	if (side === TradeSide.Short) return target < entry;
	return target > entry;
}

/** Reads prices the command states by position rather than by keyword. */
function readUnlabelledPrices(rest: string, params: TradeParams): TradeParams {
	const tokens = rest.split(/\s+/).filter(Boolean);
	if (!tokens.length || !tokens.every((token) => bareNumber.test(token)))
		return params;
	const [first, second] = tokens;
	if (tokens.length === 1) {
		if (!params.entryPrice) return { ...params, entryPrice: first };
		if (
			!params.targetPrice &&
			isPlausibleTarget(params.entryPrice, first, params.side)
		)
			return { ...params, targetPrice: first };
		return params;
	}
	if (
		tokens.length === 2 &&
		!params.entryPrice &&
		!params.targetPrice &&
		isPlausibleTarget(first, second, params.side)
	)
		return { ...params, entryPrice: first, targetPrice: second };
	return params;
}

export function parseTrade(query: string): CommandCandidate | null {
	const corrected = correctTypos(query.trim().replace(leadIn, ""), vocabulary);
	const action = /^(buy|sell|long|short)\b\s*([a-z][a-z0-9./_-]*)?/i.exec(
		corrected,
	);
	if (!action) return null;
	let params: TradeParams = {
		side: /^(sell|short)$/i.test(action[1]) ? TradeSide.Short : TradeSide.Long,
	};
	if (action[2]) params.symbol = resolveCommandSymbol(action[2]);

	let rest = corrected.slice(action[0].length).trim();
	for (const [field, patterns] of [
		["initialStopPrice", stopPatterns],
		["targetPrice", targetPatterns],
		["quantity", quantityPatterns],
		["entryPrice", entryPatterns],
	] as const) {
		const taken = take(rest, patterns);
		if (taken.value) params[field] = taken.value;
		rest = taken.rest;
	}

	rest = rest.replace(labelNoise, " ").replace(/,/g, " ").trim();
	const filled = readUnlabelledPrices(rest, params);
	if (filled !== params) {
		params = filled;
		rest = "";
	}
	const valid =
		!rest &&
		params.symbol &&
		params.entryPrice &&
		params.quantity &&
		Number(params.entryPrice) > 0 &&
		Number(params.quantity) > 0 &&
		(!params.targetPrice || Number(params.targetPrice) > 0) &&
		isValidInitialStop(params);
	return {
		id: "trade",
		title:
			`Log ${params.side?.toLowerCase()} ${params.symbol ?? ""} trade`.replace(
				/ +/g,
				" ",
			),
		intent: { type: IntentType.Trade, params },
		confidence: valid ? 0.95 : 0.75,
		...(rest
			? {
					warning:
						"Some details were not understood. Review every field before saving.",
				}
			: {}),
	};
}

function isValidInitialStop(params: TradeParams) {
	try {
		validateInitialStop(
			params.side ?? TradeSide.Long,
			params.entryPrice ?? "",
			params.initialStopPrice,
		);
		return true;
	} catch {
		return false;
	}
}
