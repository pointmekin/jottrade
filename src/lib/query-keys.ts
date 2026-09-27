import type { QueryClient } from "@tanstack/react-query";

export const QueryKey = {
	Accounts: "accounts",
	AccountEntries: "cash-flows",
	Trades: "trades",
	Trade: "trade",
	Calendar: "calendar",
	Analytics: "analytics",
	AdvancedAnalytics: "advanced-analytics",
	Strategies: "strategies",
	StrategyPerformance: "strategy-performance",
} as const;

export type QueryKey = (typeof QueryKey)[keyof typeof QueryKey];

const TRADE_DEPENDENT_KEYS: QueryKey[] = [
	QueryKey.Trades,
	QueryKey.Trade,
	QueryKey.Calendar,
	QueryKey.Analytics,
	QueryKey.AdvancedAnalytics,
	QueryKey.StrategyPerformance,
	QueryKey.Accounts,
];

const ACCOUNT_ENTRY_DEPENDENT_KEYS: QueryKey[] = [
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
