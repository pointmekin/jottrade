import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, serial, numeric, integer, jsonb } from "drizzle-orm/pg-core";

// --- Auth Schema (BetterAuth) ---

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

// --- Application Schema ---

// 2. Portfolios (Multiple broker accounts per user)
export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }), // Foreign key to users
  name: text("name").notNull(), // e.g., "Robinhood", "Binance"
  currency: text("currency").default("USD"),
  initialBalance: numeric("initial_balance").default("0"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// 3. Trades (The Core Table)
export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  
  // Basic Info
  symbol: text("symbol").notNull(),     // AAPL, BTC-USD
  side: text("side").notNull(),         // LONG, SHORT
  status: text("status").default("OPEN"), // OPEN, CLOSED, PENDING
  
  // Numbers (Use numeric for money to avoid float errors)
  entryDate: timestamp("entry_date").notNull(),
  exitDate: timestamp("exit_date"),
  entryPrice: numeric("entry_price"),
  exitPrice: numeric("exit_price"),
  quantity: numeric("quantity"),
  fees: numeric("fees").default("0"),
  
  // Calculations (Computed on insert/update usually, but stored for speed)
  netPnl: numeric("net_pnl"),
  returnPercent: numeric("return_percent"),
  
  // Analysis & Psychology (StonkJournal Features)
  setupId: integer("setup_id"),         // Link to specific strategy (will add relation below if needed, or keeping loose for now based on spec)
  mistake: text("mistake"),             // e.g., "Fomo", "Revenge Trading"
  confidence: text("confidence"),       // HIGH, MEDIUM, LOW
  notes: text("notes"),                 // Rich text/Markdown
  screenshots: jsonb("screenshots").default([]), // Array of URLs
  
  // Import Deduplication
  importHash: text("import_hash").unique(), // SHA256 of trade details
}, (t) => [
  index("idx_trades_user").on(t.userId),
  index("idx_trades_date").on(t.entryDate),
]);

// 4. Setups/Strategies (For "Pattern Analysis")
export const strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g., "Breakout", "Gap Fill"
  description: text("description"),
});

// --- Relations ---

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  portfolios: many(portfolios),
  trades: many(trades),
  strategies: many(strategies),
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
