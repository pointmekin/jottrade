import {
	index,
	integer,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import type { ExecutionKind } from "@/lib/position";
import { portfolios, trades, user } from "./trading-schema";

// A trade with execution_count = 0 has no rows here: its own columns are its one entry and one exit.
export const tradeExecutions = pgTable(
	"trade_executions",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		portfolioId: integer("portfolio_id")
			.notNull()
			.references(() => portfolios.id, { onDelete: "cascade" }),
		tradeId: integer("trade_id")
			.notNull()
			.references(() => trades.id, { onDelete: "cascade" }),
		kind: text("kind").$type<ExecutionKind>().notNull(),
		executedAt: timestamp("executed_at").notNull(),
		price: numeric("price").notNull(),
		quantity: numeric("quantity").notNull(),
		fees: numeric("fees").default("0").notNull(),
		exitQuoteToAccountRate: numeric("exit_quote_to_account_rate"),
		realizedPnl: numeric("realized_pnl"),
		sourceTradeId: integer("source_trade_id").references(() => trades.id),
		sequence: integer("sequence").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		index("idx_trade_executions_trade").on(t.tradeId, t.executedAt, t.sequence),
		index("idx_trade_executions_portfolio").on(t.portfolioId, t.executedAt),
	],
);
