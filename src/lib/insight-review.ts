import { formatMoney } from "./currency";
import type { SessionFinding, SizingFinding, TagFinding } from "./insights";
import { plural } from "./risk-rule-format";

const perTrade = (difference: number, count: number, currency: string) =>
	`${formatMoney(difference, currency, { signed: true })} per trade against the scope avg (${plural(count, "trade")})`;

export function tagFindingText(
	tag: TagFinding & { difference: number },
	currency: string,
) {
	return `Tag "${tag.name}": ${perTrade(tag.difference, tag.count, currency)}.`;
}

export function sizingFindingText(sizing: SizingFinding & { change: number }) {
	const sign = sizing.change > 0 ? "+" : "";
	return `Sizing after a loss: ${sign}${sizing.change}% median initial risk (${plural(sizing.afterLoss.withRisk, "trade")} after a loss).`;
}

export function sessionFindingText(
	session: SessionFinding & { difference: number },
	currency: string,
) {
	return `${session.name} session: ${perTrade(session.difference, session.count, currency)}.`;
}

export function insightReviewLine(text: string, href: string) {
	return `- ${text} Trades: ${href}`;
}

/** Returns the text unchanged when the line is already in it, so a second click adds no copy. */
export function appendReviewLine(current: string, line: string) {
	if (current.split("\n").includes(line)) return current;
	return current ? `${current}\n${line}` : line;
}
