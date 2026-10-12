import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cashFlows, importIdentities, trades } from "@/db/schema";
import type { ImportPreviewRow } from "@/lib/import-batch";
import {
	type BrokerAdjustment,
	type BrokerTrade,
	ImportKind,
} from "@/lib/import-batch";
import {
	type ExistingImportRecord,
	matchImportRows,
} from "@/lib/import-matching";
export function storedTradeSnapshot(
	row: typeof trades.$inferSelect,
): BrokerTrade {
	return {
		kind: ImportKind.Trades,
		symbol: row.symbol,
		side: row.side,
		status: row.status ?? "OPEN",
		entryDate: row.entryDate.toISOString(),
		entryPrice: row.entryPrice ?? "0",
		quantity: row.quantity ?? "0",
		exitDate: row.exitDate?.toISOString() ?? null,
		exitPrice: row.exitPrice,
		fees: row.fees ?? "0",
		netPnl: row.netPnl,
		returnPercent: row.returnPercent,
		brokerSource: row.brokerSource,
		brokerTicket: row.brokerTicket,
		brokerProfit: row.brokerProfit,
		brokerCommission: row.brokerCommission,
		brokerSwap: row.brokerSwap,
		brokerCloseReason: row.brokerCloseReason,
		importHash: row.importHash,
	};
}
export function storedAdjustmentSnapshot(
	row: typeof cashFlows.$inferSelect,
): BrokerAdjustment {
	return {
		kind: ImportKind.Adjustments,
		occurredAt: row.occurredAt.toISOString(),
		amount: row.amount,
		entryKind: row.kind,
		brokerSource: row.brokerSource,
		brokerAdjustment: row.brokerAdjustment,
		importHash: row.importHash,
	};
}
export async function loadImportMatches(
	userId: string,
	portfolioId: number,
	kind: ImportKind,
	rows: ImportPreviewRow[],
): Promise<ImportPreviewRow[]> {
	let existing: ExistingImportRecord[];
	if (kind === ImportKind.Trades) {
		const stored = await db
			.select()
			.from(trades)
			.where(
				and(eq(trades.userId, userId), eq(trades.portfolioId, portfolioId)),
			);
		existing = stored.map((row) => ({
			id: row.id,
			revision: row.editRevision,
			snapshot: storedTradeSnapshot(row),
			importHash: row.importHash,
			notes: row.notes,
			initialRiskAmount: row.initialRiskAmount,
			initialRiskSnapshot: row.initialRiskSnapshot,
			reason: "Existing trade",
		}));
	} else {
		const stored = await db
			.select()
			.from(cashFlows)
			.where(
				and(
					eq(cashFlows.userId, userId),
					eq(cashFlows.portfolioId, portfolioId),
				),
			);
		existing = stored.map((row) => ({
			id: row.id,
			revision: row.editRevision,
			snapshot: storedAdjustmentSnapshot(row),
			importHash: row.importHash,
			notes: row.note,
			reason: "Existing adjustment",
		}));
	}
	const aliases = await db
		.select()
		.from(importIdentities)
		.where(
			and(
				eq(importIdentities.userId, userId),
				eq(importIdentities.portfolioId, portfolioId),
				eq(importIdentities.kind, kind),
			),
		);
	return matchImportRows(
		rows,
		existing,
		aliases.map((alias) => ({
			fingerprint: alias.fingerprint,
			occurrence: alias.occurrence,
			recordId: alias.tradeId ?? alias.cashFlowId,
			state: alias.state,
		})),
	);
}
