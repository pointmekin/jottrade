import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lockPortfolio } from "@/db/portfolios";
import { portfolios, riskRuleVersions } from "@/db/schema";
import {
	hasRiskRules,
	type RiskRules,
	storedRiskRulesSchema,
} from "@/lib/risk-rules";

const NO_TIMEZONE = "Choose your review timezone first.";

async function requireRulesAccount(userId: string, portfolioId: number) {
	const [account] = await db
		.select({ reviewTimezone: portfolios.reviewTimezone })
		.from(portfolios)
		.where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)));
	if (!account) throw new Error("Account not found.");
	return account;
}

export async function loadRiskRules(userId: string, portfolioId: number) {
	const { reviewTimezone } = await requireRulesAccount(userId, portfolioId);
	const [latest] = await db
		.select({
			version: riskRuleVersions.version,
			rules: riskRuleVersions.rules,
			timezone: riskRuleVersions.timezone,
			effectiveFrom: riskRuleVersions.effectiveFrom,
		})
		.from(riskRuleVersions)
		.where(
			and(
				eq(riskRuleVersions.portfolioId, portfolioId),
				eq(riskRuleVersions.userId, userId),
			),
		)
		.orderBy(desc(riskRuleVersions.version))
		.limit(1);
	const current = latest
		? { ...latest, rules: storedRiskRulesSchema.parse(latest.rules) }
		: null;
	return { current, reviewTimezone };
}

/**
 * Inserts the next version under the account lock. It writes nothing when the
 * rules and the review timezone equal the latest version, or when the account
 * has no version and the rules are empty.
 */
export async function appendRiskRuleVersion(
	userId: string,
	portfolioId: number,
	rules: RiskRules,
) {
	const { reviewTimezone } = await requireRulesAccount(userId, portfolioId);
	if (!reviewTimezone) throw new Error(NO_TIMEZONE);
	const rulesJson = JSON.stringify(rules);
	const results = await db.batch([
		lockPortfolio(userId, portfolioId),
		db.execute<{ version: number }>(sql`
			INSERT INTO risk_rule_versions (user_id, portfolio_id, version, rules, timezone)
			SELECT p.user_id, p.id,
				coalesce((SELECT max(r.version) FROM risk_rule_versions r WHERE r.portfolio_id = p.id), 0) + 1,
				${rulesJson}::jsonb, p.review_timezone
			FROM portfolios p
			WHERE p.id = ${portfolioId} AND p.user_id = ${userId} AND p.review_timezone IS NOT NULL
				AND NOT coalesce((
					SELECT r.rules = ${rulesJson}::jsonb AND r.timezone = p.review_timezone
					FROM risk_rule_versions r WHERE r.portfolio_id = p.id
					ORDER BY r.version DESC LIMIT 1
				), ${!hasRiskRules(rules)})
			RETURNING version`),
	]);
	const [saved] = results[1].rows;
	return { saved: Boolean(saved) };
}
