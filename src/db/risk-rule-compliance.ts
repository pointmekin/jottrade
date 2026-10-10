import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { cashFlows, riskRuleVersions, trades } from "@/db/schema";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import type { ComplianceHistory } from "@/lib/risk-rule-compliance";
import { storedRiskRulesSchema } from "@/lib/risk-rules";
import type { InitialRiskSnapshot } from "@/lib/trade-risk-schema";

const toNumber = (value: string | null) =>
	value === null ? null : Number(value);

/**
 * Reads all trades of the account, not only the period: the day-start
 * balance and the cooldown streak need the earlier trades. Null when the
 * account has no rule version.
 */
export async function loadComplianceHistory(
	userId: string,
	portfolioId: number,
): Promise<ComplianceHistory | null> {
	const account = await requireOwnedPortfolio(userId, portfolioId);
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
			),
		);
	if (versionRows.length === 0) return null;
	const [tradeRows, flowRows] = await Promise.all([
		db
			.select({
				id: trades.id,
				status: trades.status,
				entryDate: trades.entryDate,
				exitDate: trades.exitDate,
				netPnl: trades.netPnl,
				initialRiskAmount: trades.initialRiskAmount,
				initialRiskPercent: trades.initialRiskPercent,
				riskCurrency: sql<
					string | null
				>`${trades.initialRiskSnapshot}->>'accountCurrency'`,
				riskReason: sql<
					InitialRiskSnapshot["unavailableReason"]
				>`${trades.initialRiskSnapshot}->>'unavailableReason'`,
				imported: sql<boolean>`${trades.importHash} is not null`,
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
	return {
		currency: account.currency ?? DEFAULT_CURRENCY,
		versions: versionRows.map((row) => ({
			...row,
			rules: storedRiskRulesSchema.parse(row.rules),
		})),
		trades: tradeRows.map(
			({
				riskCurrency,
				riskReason,
				initialRiskAmount,
				initialRiskPercent,
				...trade
			}) => ({
				...trade,
				netPnl: toNumber(trade.netPnl),
				plan: {
					initialRiskAmount,
					initialRiskPercent,
					initialRiskSnapshot: riskCurrency
						? { accountCurrency: riskCurrency, unavailableReason: riskReason }
						: null,
				},
			}),
		),
		cashFlows: flowRows.map((flow) => ({
			...flow,
			amount: Number(flow.amount),
		})),
	};
}
