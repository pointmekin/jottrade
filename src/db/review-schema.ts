import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import {
	type ReviewCashFlowSnapshot,
	type ReviewKind,
	type ReviewResultSnapshot,
	ReviewStatus,
	type ReviewTradeSnapshot,
} from "@/lib/review";
import { cashFlows, portfolios, trades, user } from "./trading-schema";
export const reviewPeriods = pgTable(
	"review_periods",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		portfolioId: integer("portfolio_id")
			.notNull()
			.references(() => portfolios.id, { onDelete: "cascade" }),
		kind: text("kind").$type<ReviewKind>().notNull(),
		status: text("status")
			.$type<ReviewStatus>()
			.default(ReviewStatus.Draft)
			.notNull(),
		periodStart: date("period_start").notNull(),
		periodEndExclusive: date("period_end_exclusive").notNull(),
		timezoneSnapshot: text("timezone_snapshot").notNull(),
		weekStartsOnSnapshot: integer("week_starts_on_snapshot").notNull(),
		currencySnapshot: text("currency_snapshot").notNull(),
		templateVersion: integer("template_version").default(1).notNull(),
		intent: text("intent").default("").notNull(),
		execution: text("execution").default("").notNull(),
		lesson: text("lesson").default("").notNull(),
		nextAction: text("next_action").default("").notNull(),
		notes: text("notes").default("").notNull(),
		commitmentReflection: text("commitment_reflection").default("").notNull(),
		previousReviewId: integer("previous_review_id"),
		previousCommitmentSnapshot: text("previous_commitment_snapshot"),
		revision: integer("revision").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		resultSnapshot: jsonb("result_snapshot").$type<ReviewResultSnapshot>(),
	},
	(t) => [
		uniqueIndex("review_period_identity").on(
			t.portfolioId,
			t.kind,
			t.periodStart,
		),
		check(
			"review_period_dates",
			sql`${t.periodEndExclusive} > ${t.periodStart}`,
		),
		check("review_period_kind", sql`${t.kind} in ('DAILY','WEEKLY')`),
		check("review_period_status", sql`${t.status} in ('DRAFT','COMPLETE')`),
	],
);
export const reviewSourceTrades = pgTable(
	"review_source_trades",
	{
		reviewId: integer("review_id")
			.notNull()
			.references(() => reviewPeriods.id, { onDelete: "cascade" }),
		tradeId: integer("trade_id")
			.notNull()
			.references(() => trades.id, { onDelete: "restrict" }),
		executionFingerprint: text("execution_fingerprint").notNull(),
		snapshot: jsonb("snapshot").$type<ReviewTradeSnapshot>().notNull(),
		includedInSnapshot: boolean("included_in_snapshot")
			.default(false)
			.notNull(),
		linkedAt: timestamp("linked_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.reviewId, t.tradeId] }),
		index("review_source_trade_lookup").on(t.tradeId),
	],
);
export const reviewSourceCashFlows = pgTable(
	"review_source_cash_flows",
	{
		reviewId: integer("review_id")
			.notNull()
			.references(() => reviewPeriods.id, { onDelete: "cascade" }),
		cashFlowId: integer("cash_flow_id")
			.notNull()
			.references(() => cashFlows.id, { onDelete: "restrict" }),
		executionFingerprint: text("execution_fingerprint").notNull(),
		snapshot: jsonb("snapshot").$type<ReviewCashFlowSnapshot>().notNull(),
		includedInSnapshot: boolean("included_in_snapshot")
			.default(false)
			.notNull(),
		linkedAt: timestamp("linked_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.reviewId, t.cashFlowId] }),
		index("review_source_flow_lookup").on(t.cashFlowId),
	],
);
