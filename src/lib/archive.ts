export const ARCHIVE_SCHEMA_VERSION = 1;

type WithTradeId = { id: number; screenshots?: string[] | null };

type ArchiveTables<Trade extends WithTradeId> = {
	accounts: unknown[];
	trades: Trade[];
	cashFlows: unknown[];
	strategies: unknown[];
	reviews: unknown[];
	reviewSourceTrades: unknown[];
	reviewSourceCashFlows: unknown[];
	tags: unknown[];
	tradeTags: unknown[];
	savedViews: unknown[];
};

export function buildArchive<Trade extends WithTradeId>(
	tables: ArchiveTables<Trade>,
	exportedAt: Date,
) {
	const attachments = tables.trades.flatMap((trade) =>
		(trade.screenshots ?? []).map((url) => ({ tradeId: trade.id, url })),
	);
	return {
		format: "jottrade-archive",
		schemaVersion: ARCHIVE_SCHEMA_VERSION,
		exportedAt: exportedAt.toISOString(),
		conventions: {
			timestamps:
				"ISO 8601 in UTC (suffix Z). Review period dates are calendar days in the review timezone of each review.",
			decimals:
				"Prices, amounts and P&L are decimal strings as stored. Do not parse them as floats.",
			currency:
				"Money fields are in the currency of the owning account (accounts[].currency).",
			attachments:
				"Screenshots are referenced by URL and are not bundled. Download them separately to keep them.",
		},
		counts: {
			accounts: tables.accounts.length,
			trades: tables.trades.length,
			cashFlows: tables.cashFlows.length,
			strategies: tables.strategies.length,
			reviews: tables.reviews.length,
			tags: tables.tags.length,
			savedViews: tables.savedViews.length,
			attachments: attachments.length,
		},
		accounts: tables.accounts,
		trades: tables.trades,
		cashFlows: tables.cashFlows,
		strategies: tables.strategies,
		reviews: tables.reviews,
		reviewSourceTrades: tables.reviewSourceTrades,
		reviewSourceCashFlows: tables.reviewSourceCashFlows,
		tags: tables.tags,
		tradeTags: tables.tradeTags,
		savedViews: tables.savedViews,
		attachments,
	};
}
