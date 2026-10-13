import { ExecutionKind, type PositionFill } from "./position";
import { TradeStatus } from "./trade";

export type BrokerLeg = {
	id: number;
	portfolioId: number;
	symbol: string;
	side: string;
	status: string | null;
	entryDate: Date;
	entryPrice: string | null;
	quantity: string | null;
	exitDate: Date | null;
	exitPrice: string | null;
	fees: string | null;
	netPnl: string | null;
	brokerTicket: string | null;
	importHash: string | null;
	groupedIntoId: number | null;
};

export type GroupSuggestion = { tradeIds: number[]; reason: string };

export const SUGGESTION_REASON = "Same open time and price";

const isGroupable = (leg: BrokerLeg) =>
	Boolean(leg.importHash) &&
	leg.groupedIntoId === null &&
	leg.status === TradeStatus.Closed &&
	Boolean(leg.entryPrice && leg.quantity && leg.exitPrice && leg.exitDate) &&
	leg.netPnl !== null;

const isMixed = (legs: BrokerLeg[], value: (leg: BrokerLeg) => unknown) =>
	new Set(legs.map(value)).size > 1;

/** The reason the rows cannot become one position, or null. */
export function groupingError(legs: BrokerLeg[]): string | null {
	if (legs.length < 2) return "Select two or more broker rows.";
	if (legs.some((leg) => !leg.importHash))
		return "Only imported broker rows can be grouped.";
	if (legs.some((leg) => leg.groupedIntoId !== null))
		return "A row is already grouped into a position.";
	if (!legs.every(isGroupable))
		return "Only closed broker rows can be grouped.";
	if (isMixed(legs, (leg) => leg.portfolioId))
		return "Rows are in different accounts.";
	if (isMixed(legs, (leg) => leg.symbol)) return "Rows have different symbols.";
	if (isMixed(legs, (leg) => leg.side)) return "Rows have different sides.";
	return null;
}

/** Closed broker rows of one account with the same symbol, side, open time and open price. The user confirms each group. */
export function suggestGroups(legs: BrokerLeg[]): GroupSuggestion[] {
	const groups = new Map<string, number[]>();
	for (const leg of legs.filter(isGroupable)) {
		const key = [
			leg.portfolioId,
			leg.symbol,
			leg.side,
			leg.entryDate.getTime(),
			Number(leg.entryPrice),
		].join("|");
		groups.set(key, [...(groups.get(key) ?? []), leg.id]);
	}
	return [...groups.values()]
		.filter((ids) => ids.length > 1)
		.map((tradeIds) => ({ tradeIds, reason: SUGGESTION_REASON }));
}

/** One entry and one exit fill per leg. Entries come first, so a fill at the same time never closes more than is open. */
export function legFills(
	legs: BrokerLeg[],
): (PositionFill & { sourceTradeId: number })[] {
	const entries = legs.map((leg) => ({
		kind: ExecutionKind.Entry,
		executedAt: leg.entryDate,
		price: leg.entryPrice ?? "",
		quantity: leg.quantity ?? "",
		fees: "0",
		sourceTradeId: leg.id,
	}));
	const exits = legs.map((leg) => ({
		kind: ExecutionKind.Exit,
		executedAt: leg.exitDate ?? leg.entryDate,
		price: leg.exitPrice ?? "",
		quantity: leg.quantity ?? "",
		fees: leg.fees ?? "0",
		brokerRealizedPnl: leg.netPnl,
		sourceTradeId: leg.id,
	}));
	return [...entries, ...exits];
}

export function groupedNotes(legs: (BrokerLeg & { notes: string | null })[]) {
	const parts = legs
		.filter((leg) => leg.notes?.trim())
		.map(
			(leg) => `Ticket ${leg.brokerTicket ?? leg.id}:\n${leg.notes?.trim()}`,
		);
	return parts.length ? parts.join("\n\n") : null;
}
