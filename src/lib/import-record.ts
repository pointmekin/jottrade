import { AccountEntryKind } from "./account-entry";
import type { ImportedAdjustment } from "./adjustment-import";
import { priceReturnPercent } from "./finance";
import { sha256Hex } from "./hash";
import {
	type BrokerAdjustment,
	type BrokerRecord,
	type BrokerTrade,
	ImportKind,
} from "./import-batch";
import { TradeSide, TradeStatus } from "./trade";
import type { ImportedTrade } from "./trade-import";

export function tradeBrokerRecord(value: ImportedTrade): BrokerTrade {
	const side = value.side === "buy" ? TradeSide.Long : TradeSide.Short;
	return {
		kind: ImportKind.Trades,
		symbol: value.symbol,
		side,
		status: value.exitDate ? TradeStatus.Closed : TradeStatus.Open,
		entryDate: value.entryDate,
		entryPrice: value.entryPrice,
		quantity: value.quantity,
		exitDate: value.exitDate ?? null,
		exitPrice: value.exitPrice ?? null,
		fees: value.fees,
		netPnl: value.netPnl ?? null,
		returnPercent: value.exitPrice
			? (priceReturnPercent(
					side,
					Number(value.entryPrice),
					Number(value.exitPrice),
				)?.toFixed(2) ?? null)
			: null,
		brokerSource: "exness",
		brokerTicket: value.ticket,
		brokerProfit: value.profit ?? null,
		brokerCommission: value.commission,
		brokerSwap: value.swap,
		brokerCloseReason: value.closeReason,
		importHash: null,
	};
}
export function adjustmentBrokerRecord(
	value: ImportedAdjustment,
): BrokerAdjustment {
	return {
		kind: ImportKind.Adjustments,
		occurredAt: value.occurredAt,
		amount: value.amountDecimal,
		entryKind: AccountEntryKind.Adjustment,
		brokerSource: "exness",
		brokerAdjustment: value,
		importHash: null,
	};
}
export function recordNet(record: BrokerRecord | null): string {
	if (!record) return "0";
	return record.kind === ImportKind.Trades
		? (record.netPnl ?? "0")
		: record.amount;
}
export function recordAccountNet(record: BrokerRecord | null): string {
	if (
		record?.kind === ImportKind.Trades &&
		record.status !== TradeStatus.Closed
	)
		return "0";
	return recordNet(record);
}
export async function recordFingerprint(
	userId: string,
	portfolioId: number,
	record: BrokerRecord,
): Promise<string> {
	const scope = [2, userId, portfolioId, "exness", record.kind];
	if (record.kind === ImportKind.Trades)
		return sha256Hex(
			JSON.stringify([
				...scope,
				record.symbol,
				record.side,
				record.status,
				record.entryDate,
				record.entryPrice,
				record.quantity,
				record.exitDate,
				record.exitPrice,
				record.brokerTicket,
				record.brokerProfit,
				record.brokerCommission,
				record.brokerSwap,
				record.brokerCloseReason,
			]),
		);
	const value = record.brokerAdjustment;
	if (!value) throw Error("Adjustment metadata is unavailable.");
	return sha256Hex(
		JSON.stringify([
			...scope,
			value.symbol,
			value.type,
			value.lots,
			value.positionId,
			value.exDate,
			value.occurredAt,
			value.dividendRate,
			value.amountDecimal,
		]),
	);
}
export async function legacyRecordHash(
	userId: string,
	record: BrokerRecord,
): Promise<string> {
	if (record.kind === ImportKind.Trades) {
		return sha256Hex(
			[
				userId,
				record.symbol,
				record.side,
				record.entryDate,
				record.exitDate ?? "",
				String(Number(record.entryPrice)),
				record.exitPrice ? String(Number(record.exitPrice)) : "",
				String(Number(record.quantity)),
			].join("|"),
		);
	}
	const value = record.brokerAdjustment;
	if (!value) throw Error("Adjustment metadata is unavailable.");
	return sha256Hex(
		[
			userId,
			value.symbol,
			value.type,
			value.lots,
			value.positionId,
			value.exDate,
			value.occurredAt,
			value.dividendRate,
			Number(value.amountDecimal).toFixed(2),
		].join("|"),
	);
}
export function candidateMatches(
	source: BrokerRecord,
	existing: BrokerRecord,
	notes: string | null,
): boolean {
	if (source.kind !== existing.kind) return false;
	if (
		source.kind === ImportKind.Trades &&
		existing.kind === ImportKind.Trades
	) {
		const ticket =
			existing.brokerTicket ??
			/^Ticket: ([^|]+) \|/.exec(notes ?? "")?.[1]?.trim();
		if (!ticket) return source.symbol === existing.symbol;
		return ticket === source.brokerTicket;
	}
	if (
		source.kind === ImportKind.Adjustments &&
		existing.kind === ImportKind.Adjustments
	) {
		const position = source.brokerAdjustment?.positionId;
		return Boolean(
			position &&
				(existing.brokerAdjustment?.positionId === position ||
					notes?.includes(`Position ${position} ·`)),
		);
	}
	return false;
}
