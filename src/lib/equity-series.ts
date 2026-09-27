export const EquitySeries = {
	Balance: "balance",
	Performance: "performance",
} as const;

export type EquitySeries = (typeof EquitySeries)[keyof typeof EquitySeries];

export const EQUITY_SERIES_LABEL: Record<EquitySeries, string> = {
	[EquitySeries.Balance]: "Balance",
	[EquitySeries.Performance]: "Trading P&L",
};
