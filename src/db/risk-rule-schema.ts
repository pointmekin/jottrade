import {
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type { RiskRules } from "@/lib/risk-rules";
import { portfolios, user } from "./trading-schema";

// Append-only: a save inserts the next version, and no code updates a row.
export const riskRuleVersions = pgTable(
	"risk_rule_versions",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		portfolioId: integer("portfolio_id")
			.notNull()
			.references(() => portfolios.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		rules: jsonb("rules").$type<RiskRules>().notNull(),
		timezone: text("timezone").notNull(),
		effectiveFrom: timestamp("effective_from", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		uniqueIndex("risk_rule_versions_portfolio_version_unique").on(
			t.portfolioId,
			t.version,
		),
		index("idx_risk_rule_versions_portfolio_effective").on(
			t.portfolioId,
			t.effectiveFrom,
		),
	],
);
