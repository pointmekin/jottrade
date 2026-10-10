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
import type {
	ImportOutcome,
	ImportPreviewRow,
	ImportSummary,
} from "@/lib/import-batch";
import { cashFlows, portfolios, trades, user } from "./trading-schema";

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
