import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { AccountKind } from "@/lib/account";
import { AccountEntryKind } from "@/lib/account-entry";
import type { ImportedAdjustment } from "@/lib/adjustment-import";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import type {
	ImportOutcome,
	ImportPreviewRow,
	ImportSummary,
} from "@/lib/import-batch";
import type { PlaybookCriterion } from "@/lib/playbook";
import type { PnlCalculationSnapshot } from "@/lib/pnl-context";
import { type TradeConfidence, type TradeSide, TradeStatus } from "@/lib/trade";
import type {
	InitialRiskSnapshot,
	RiskCorrection,
} from "@/lib/trade-risk-schema";
import { TagColor } from "@/lib/trade-tag";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

// Better Auth owns user, session, account and verification.
export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const userOnboarding = pgTable("user_onboarding", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
});

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const portfolios = pgTable(
	"portfolios",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		reviewTimezone: text("review_timezone"),
		reviewWeekStartsOn: integer("review_week_starts_on").default(1).notNull(),
		kind: text("kind").default(AccountKind.Real).notNull(),
		currency: text("currency").default(DEFAULT_CURRENCY),
		isDefault: boolean("is_default").default(false),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => [
		check(
			"portfolios_review_week_start",
			sql`${table.reviewWeekStartsOn} in (0, 1)`,
		),
		uniqueIndex("portfolios_user_default_unique")
			.on(table.userId)
			.where(sql`is_default`),
	],
);

// Deposits, withdrawals and broker adjustments: balance changes outside a trade.
export const cashFlows = pgTable(
	"cash_flows",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		portfolioId: integer("portfolio_id")
			.notNull()
			.references(() => portfolios.id, {
				onDelete: "cascade",
			}),
		occurredAt: timestamp("occurred_at").notNull(),
		amount: numeric("amount").notNull(),
		kind: text("kind")
			.$type<AccountEntryKind>()
			.default(AccountEntryKind.Deposit)
			.notNull(),
		note: text("note"),
		importHash: text("import_hash").unique(),
		editRevision: integer("edit_revision").default(0).notNull(),
		brokerSource: text("broker_source"),
		brokerAdjustment: jsonb("broker_adjustment").$type<ImportedAdjustment>(),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [
		index("idx_cash_flows_user").on(t.userId),
		index("idx_cash_flows_date").on(t.occurredAt),
		index("idx_cash_flows_portfolio").on(t.portfolioId),
	],
);

export const trades = pgTable(
	"trades",
	{
		id: serial("id").primaryKey(),
		portfolioId: integer("portfolio_id")
			.notNull()
			.references(() => portfolios.id, {
				onDelete: "cascade",
			}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		symbol: text("symbol").notNull(),
		side: text("side").$type<TradeSide>().notNull(),
		status: text("status").$type<TradeStatus>().default(TradeStatus.Open),

		// numeric, not float, so money keeps exact cents.
		entryDate: timestamp("entry_date").notNull(),
		exitDate: timestamp("exit_date"),
		entryPrice: numeric("entry_price"),
		targetPrice: numeric("target_price"),
		initialStopPrice: numeric("initial_stop_price"),
		initialTargetPrice: numeric("initial_target_price"),
		initialRiskAmount: numeric("initial_risk_amount"),
		initialRiskPercent: numeric("initial_risk_percent"),
		initialRiskSnapshot: jsonb(
			"initial_risk_snapshot",
		).$type<InitialRiskSnapshot>(),
		managementStopPrice: numeric("management_stop_price"),
		riskCorrectionHistory: jsonb("risk_correction_history").$type<
			RiskCorrection[]
		>(),
		exitQuoteToAccountRate: numeric("exit_quote_to_account_rate"),
		pnlCalculationSnapshot: jsonb(
			"pnl_calculation_snapshot",
		).$type<PnlCalculationSnapshot>(),
		exitPrice: numeric("exit_price"),
		quantity: numeric("quantity"),
		fees: numeric("fees").default("0"),

		netPnl: numeric("net_pnl"),
		returnPercent: numeric("return_percent"),

		setupId: integer("setup_id"),
		mistake: text("mistake"),
		confidence: text("confidence").$type<TradeConfidence>(),
		notes: text("notes"),
		screenshots: jsonb("screenshots").$type<string[]>().default([]),

		importHash: text("import_hash").unique(),
		editRevision: integer("edit_revision").default(0).notNull(),
		annotationRevision: integer("annotation_revision").default(0).notNull(),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
		reviewedExecutionFingerprint: text("reviewed_execution_fingerprint"),
		brokerSource: text("broker_source"),
		brokerTicket: text("broker_ticket"),
		brokerProfit: numeric("broker_profit"),
		brokerCommission: numeric("broker_commission"),
		brokerSwap: numeric("broker_swap"),
		brokerCloseReason: text("broker_close_reason"),
		playbookCheck: jsonb("playbook_check").$type<JsonObject>(),
	},
	(t) => [
		index("idx_trades_user").on(t.userId),
		index("idx_trades_date").on(t.entryDate),
		index("idx_trades_portfolio").on(t.portfolioId),
		index("idx_trades_portfolio_entry").on(
			t.portfolioId,
			t.entryDate.desc().nullsLast(),
			t.id.desc().nullsFirst(),
		),
	],
);

export const strategies = pgTable("strategies", {
	id: serial("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	description: text("description"),
	criteria: jsonb("criteria")
		.$type<PlaybookCriterion[]>()
		.default([])
		.notNull(),
	riskGuidance: text("risk_guidance"),
	criteriaVersion: integer("criteria_version").default(1).notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const tags = pgTable(
	"tags",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		color: text("color").$type<TagColor>().default(TagColor.Gray).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("tags_user_name_unique").on(t.userId, sql`lower(${t.name})`),
	],
);

export const tradeTags = pgTable(
	"trade_tags",
	{
		tradeId: integer("trade_id")
			.notNull()
			.references(() => trades.id, { onDelete: "cascade" }),
		tagId: integer("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.tradeId, t.tagId] }),
		index("idx_trade_tags_tag").on(t.tagId),
	],
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	portfolios: many(portfolios),
	trades: many(trades),
	strategies: many(strategies),
	cashFlows: many(cashFlows),
}));

export const cashFlowRelations = relations(cashFlows, ({ one }) => ({
	user: one(user, {
		fields: [cashFlows.userId],
		references: [user.id],
	}),
	portfolio: one(portfolios, {
		fields: [cashFlows.portfolioId],
		references: [portfolios.id],
	}),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const portfolioRelations = relations(portfolios, ({ one, many }) => ({
	user: one(user, {
		fields: [portfolios.userId],
		references: [user.id],
	}),
	trades: many(trades),
	cashFlows: many(cashFlows),
}));

export const tradeRelations = relations(trades, ({ one }) => ({
	portfolio: one(portfolios, {
		fields: [trades.portfolioId],
		references: [portfolios.id],
	}),
	user: one(user, {
		fields: [trades.userId],
		references: [user.id],
	}),
	strategy: one(strategies, {
		fields: [trades.setupId],
		references: [strategies.id],
	}),
}));

export const strategyRelations = relations(strategies, ({ one, many }) => ({
	user: one(user, {
		fields: [strategies.userId],
		references: [user.id],
	}),
	trades: many(trades, { relationName: "strategy" }),
}));

export const importBatches = pgTable(
	"import_batches",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		portfolioId: integer("portfolio_id")
			.notNull()
			.references(() => portfolios.id, { onDelete: "cascade" }),
		revision: integer("revision").notNull().default(0),
		kind: text("kind").notNull(),
		state: text("state").notNull().default("staged"),
		fileName: text("file_name").notNull(),
		fileHash: text("file_hash").notNull(),
		sourceCurrency: text("source_currency").notNull(),
		parserVersion: integer("parser_version").notNull().default(2),
		rows: jsonb("rows").$type<ImportPreviewRow[]>().notNull(),
		outcomes: jsonb("outcomes").$type<ImportOutcome[]>().notNull().default([]),
		summary: jsonb("summary").$type<ImportSummary>().notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		expiresAt: timestamp("expires_at").notNull(),
		committedAt: timestamp("committed_at"),
		undoneAt: timestamp("undone_at"),
	},
	(t) => [index("idx_import_batches_account").on(t.userId, t.portfolioId)],
);
export const importIdentities = pgTable(
	"import_identities",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		portfolioId: integer("portfolio_id")
			.notNull()
			.references(() => portfolios.id, { onDelete: "cascade" }),
		kind: text("kind").notNull(),
		fingerprint: text("fingerprint").notNull(),
		occurrence: integer("occurrence").default(0).notNull(),
		tradeId: integer("trade_id").references(() => trades.id, {
			onDelete: "set null",
		}),
		cashFlowId: integer("cash_flow_id").references(() => cashFlows.id, {
			onDelete: "set null",
		}),
		recordedRecordId: integer("recorded_record_id").notNull(),
		state: text("state").notNull().default("active"),
		batchId: text("batch_id")
			.notNull()
			.references(() => importBatches.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("import_identity_account_version_unique").on(
			t.userId,
			t.portfolioId,
			t.kind,
			t.fingerprint,
			t.occurrence,
		),
	],
);
