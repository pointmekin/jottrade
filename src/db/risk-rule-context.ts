import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { cashFlows, riskRuleVersions, trades } from "@/db/schema";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { buildRuleContext } from "@/lib/risk-rule-evaluation";
import { storedRiskRulesSchema } from "@/lib/risk-rules";

export async function loadRuleContext(
	userId: string,
	portfolioId: number,
	entryDate: Date,
) {
	const account = await requireOwnedPortfolio(userId, portfolioId);
	const currency = account.currency ?? DEFAULT_CURRENCY;
	const owned = (table: typeof trades | typeof cashFlows) =>
		and(eq(table.userId, userId), eq(table.portfolioId, portfolioId));
	const versionRows = await db
		.select({
			version: riskRuleVersions.version,
			rules: riskRuleVersions.rules,
			timezone: riskRuleVersions.timezone,
			effectiveFrom: riskRuleVersions.effectiveFrom,
		})
		.from(riskRuleVersions)
		.where(
			and(
				eq(riskRuleVersions.userId, userId),
				eq(riskRuleVersions.portfolioId, portfolioId),
				lte(riskRuleVersions.effectiveFrom, entryDate),
			),
		);
	const versions = versionRows.map((row) => ({
		...row,
		rules: storedRiskRulesSchema.parse(row.rules),
	}));
	if (versions.length === 0)
		return buildRuleContext(
			{ versions, currency, trades: [], cashFlows: [] },
			entryDate,
		);
	const [tradeRows, flowRows] = await Promise.all([
		db
			.select({
				status: trades.status,
				entryDate: trades.entryDate,
				exitDate: trades.exitDate,
				netPnl: trades.netPnl,
			})
			.from(trades)
			.where(owned(trades)),
		db
			.select({
				occurredAt: cashFlows.occurredAt,
				amount: cashFlows.amount,
				kind: cashFlows.kind,
			})
			.from(cashFlows)
			.where(owned(cashFlows)),
	]);
	return buildRuleContext(
		{
			versions,
			currency,
			trades: tradeRows.map((trade) => ({
				...trade,
				netPnl: trade.netPnl === null ? null : Number(trade.netPnl),
			})),
			cashFlows: flowRows.map((flow) => ({
				...flow,
				amount: Number(flow.amount),
			})),
		},
		entryDate,
	);
}
