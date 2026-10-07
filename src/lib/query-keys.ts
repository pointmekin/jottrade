import type { QueryClient } from "@tanstack/react-query";

export const QueryKey = {
	ImportBatches: "import-batches",
	ImportBatch: "import-batch",
	ImportUndo: "import-undo",
	Accounts: "accounts",
	ReviewPeriod: "review-period",
	ReviewQueue: "review-queue",
	TradeReviewAnnotation: "trade-review-annotation",
	ReviewPreferences: "review-preferences",
	AccountEntries: "cash-flows",
	Trades: "trades",
	Trade: "trade",
	Calendar: "calendar",
	Analytics: "analytics",
	AdvancedAnalytics: "advanced-analytics",
	Strategies: "strategies",
	Tags: "tags",
	StrategyPerformance: "strategy-performance",
	ExnessExportScript: "exness-export-script",
} as const;

export type QueryKey = (typeof QueryKey)[keyof typeof QueryKey];

const TRADE_DEPENDENT_KEYS: QueryKey[] = [
	QueryKey.ReviewPeriod,
	QueryKey.ReviewQueue,
	QueryKey.TradeReviewAnnotation,
	QueryKey.ImportBatches,
	QueryKey.ImportBatch,
	QueryKey.ImportUndo,
	QueryKey.Trades,
	QueryKey.Trade,
	QueryKey.Calendar,
	QueryKey.Analytics,
	QueryKey.AdvancedAnalytics,
	QueryKey.StrategyPerformance,
	QueryKey.Accounts,
];

const ACCOUNT_ENTRY_DEPENDENT_KEYS: QueryKey[] = [
	QueryKey.ReviewPeriod,
	QueryKey.ImportBatches,
	QueryKey.ImportBatch,
	QueryKey.ImportUndo,
	QueryKey.AccountEntries,
	QueryKey.Accounts,
	QueryKey.Trade,
	QueryKey.Analytics,
	QueryKey.AdvancedAnalytics,
];

function invalidate(queryClient: QueryClient, keys: QueryKey[]) {
	return Promise.all(
		keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
	);
}

export const invalidateTradeQueries = (queryClient: QueryClient) =>
	invalidate(queryClient, TRADE_DEPENDENT_KEYS);

export const invalidateAccountEntryQueries = (queryClient: QueryClient) =>
	invalidate(queryClient, ACCOUNT_ENTRY_DEPENDENT_KEYS);

export const invalidateImportQueries = (queryClient: QueryClient) =>
	invalidate(queryClient, [
		QueryKey.ImportBatches,
		QueryKey.ImportBatch,
		QueryKey.ImportUndo,
	]);
