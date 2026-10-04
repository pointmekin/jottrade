import {
	ImportAction,
	type ImportCommitPlan,
	ImportKind,
	type ImportPreviewRow,
	type ImportSummary,
} from "./import-batch";
import { recordAccountNet, recordNet } from "./import-record";
import { subtractImportMoney, sumImportMoney } from "./import-values";
import { TradeStatus } from "./trade";

const MUTATING_ACTIONS = new Set<ImportAction>([
	ImportAction.Insert,
	ImportAction.Reimport,
	ImportAction.Correct,
	ImportAction.Adopt,
]);
export function summarizeImport(
	rows: ImportPreviewRow[],
	plan: ImportCommitPlan[] = [],
): ImportSummary {
	const counts: ImportSummary["counts"] = {};
	for (const row of rows) counts[row.action] = (counts[row.action] ?? 0) + 1;
	const trades = rows.flatMap((row) =>
		row.record?.kind === ImportKind.Trades ? [row.record] : [],
	);
	const openTrades = trades.filter(
		(trade) => trade.status !== TradeStatus.Closed,
	);
	const deltas = plan.map((item) => {
		if (
			item.action === ImportAction.Insert ||
			item.action === ImportAction.Reimport
		)
			return recordAccountNet(item.after);
		if (item.action === ImportAction.Correct)
			return subtractImportMoney(
				recordAccountNet(item.after),
				recordAccountNet(item.before),
			);
		return "0";
	});
	return {
		warnings: [
			...(rows.length >= 1000 && trades.length
				? [
						"The native history export may be capped at 1000 records. Check that the selected date range covers your intended source.",
					]
				: []),
			...new Set(
				rows.flatMap((row) =>
					Object.entries(row.source)
						.filter(
							([key, value]) =>
								key.trim().toLowerCase() === "export warning" && value,
						)
						.map(([, value]) => value as string),
				),
			),
		],
		rows: rows.length,
		counts,
		gross: sumImportMoney(trades.map((trade) => trade.brokerProfit ?? "0")),
		commission: sumImportMoney(
			trades.map((trade) => trade.brokerCommission ?? "0"),
		),
		swap: sumImportMoney(trades.map((trade) => trade.brokerSwap ?? "0")),
		sourceNet: sumImportMoney(rows.map((row) => recordAccountNet(row.record))),
		openRows: openTrades.length,
		openNet: sumImportMoney(openTrades.map(recordNet)),
		accountDelta: sumImportMoney(deltas),
		expectedAccountDelta: sumImportMoney(deltas),
		expectedMutations: plan.filter((item) => MUTATING_ACTIONS.has(item.action))
			.length,
		actualMutations: null,
		accountBefore: null,
		accountAfter: null,
		reconciled: null,
		unknownAmounts: rows.filter(
			(row) =>
				!row.record ||
				(row.record.kind === ImportKind.Trades && row.record.netPnl === null),
		).length,
		excluded: counts[ImportAction.Exclude] ?? 0,
	};
}
