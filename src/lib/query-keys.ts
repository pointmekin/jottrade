import type { QueryClient } from "@tanstack/react-query";

export const QueryKey = {
	ImportBatches: "import-batches",
	ImportBatch: "import-batch",
	ImportUndo: "import-undo",
	Accounts: "accounts",
	Onboarding: "onboarding",
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
	SavedViews: "saved-views",
	RiskRules: "risk-rules",
	RuleContext: "rule-context",
	RuleToday: "rule-today",
	RuleCompliance: "rule-compliance",
	StrategyPerformance: "strategy-performance",
	PlaybookCheck: "playbook-check",
	ExnessExportScript: "exness-export-script",
	AuthAccounts: "auth-accounts",
	AuthSessions: "auth-sessions",
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
	QueryKey.PlaybookCheck,
	QueryKey.RuleContext,
	QueryKey.RuleToday,
	QueryKey.RuleCompliance,
	QueryKey.Accounts,
	QueryKey.Onboarding,
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
	QueryKey.RuleContext,
	QueryKey.RuleToday,
	QueryKey.RuleCompliance,
	QueryKey.Onboarding,
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

export const invalidateRiskRuleQueries = (queryClient: QueryClient) =>
	invalidate(queryClient, [
		QueryKey.RiskRules,
		QueryKey.RuleContext,
		QueryKey.RuleToday,
		QueryKey.RuleCompliance,
	]);

export const invalidateImportQueries = (queryClient: QueryClient) =>
	invalidate(queryClient, [
		QueryKey.ImportBatches,
		QueryKey.ImportBatch,
		QueryKey.ImportUndo,
	]);
