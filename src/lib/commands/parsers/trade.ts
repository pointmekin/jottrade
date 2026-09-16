import { resolveCommandSymbol } from "../aliases";
import type { CommandCandidate, TradeParams } from "../types";

const number = "(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
export function parseTrade(query: string): CommandCandidate | null {
	const action = /^(buy|sell|long|short)\b\s*([a-z][a-z0-9./_-]*)?/i.exec(
		query,
	);
	if (!action) return null;
	const params: TradeParams = {
		side: /^(sell|short)$/i.test(action[1]) ? "SHORT" : "LONG",
	};
	if (action[2]) params.symbol = resolveCommandSymbol(action[2]);
	let rest = query.slice(action[0].length).trim();
	const target = new RegExp(`\\b(?:target|tp)\\s+(${number})(?=\\s|,|$)`, "i");
	const size = new RegExp(
		`(${number})\\s+(?:lots?|units?|shares?)(?=\\s|,|$)`,
		"i",
	);
	const targetMatch = target.exec(rest);
	if (targetMatch) {
		params.targetPrice = targetMatch[1];
		rest = rest.replace(target, " ");
	}
	const sizeMatch = size.exec(rest);
	// A minus before a matched number must never be dropped.
	if (sizeMatch && rest[sizeMatch.index - 1] !== "-") {
		params.quantity = sizeMatch[1];
		rest = rest.replace(size, " ");
	}
	rest = rest
		.replace(/\b(?:at|with|and)\b/gi, " ")
		.replace(/,/g, " ")
		.trim();
	if (new RegExp(`^${number}$`).test(rest)) {
		params.entryPrice = rest;
		rest = "";
	}
	const valid =
		!rest &&
		params.symbol &&
		params.entryPrice &&
		params.quantity &&
		Number(params.entryPrice) > 0 &&
		Number(params.quantity) > 0 &&
		(!params.targetPrice || Number(params.targetPrice) > 0);
	return {
		id: "trade",
		title:
			`Log ${params.side.toLowerCase()} ${params.symbol ?? ""} trade`.replace(
				/ +/g,
				" ",
			),
		intent: { type: "trade", params },
		confidence: valid ? 0.95 : 0.75,
		...(rest
			? {
					warning:
						"Some details were not understood. Review every field before saving.",
				}
			: {}),
	};
}
