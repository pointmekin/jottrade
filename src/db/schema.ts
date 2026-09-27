import { relations, sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { AccountKind } from "@/lib/account";
import { AccountEntryKind } from "@/lib/account-entry";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { type TradeConfidence, type TradeSide, TradeStatus } from "@/lib/trade";

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
		kind: text("kind").default(AccountKind.Real).notNull(),
		currency: text("currency").default(DEFAULT_CURRENCY),
		isDefault: boolean("is_default").default(false),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => [
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
	},
	(t) => [
		index("idx_trades_user").on(t.userId),
		index("idx_trades_date").on(t.entryDate),
		index("idx_trades_portfolio").on(t.portfolioId),
	],
);

export const strategies = pgTable("strategies", {
	id: serial("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	description: text("description"),
});

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
