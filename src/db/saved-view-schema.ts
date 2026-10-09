import { sql } from "drizzle-orm";
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
import { portfolios, user } from "./trading-schema";

// A null account means "use the active account"; the scope is parsed on every read.
export const savedViews = pgTable(
	"saved_views",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		portfolioId: integer("portfolio_id").references(() => portfolios.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		scope: jsonb("scope").$type<unknown>().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		uniqueIndex("saved_views_user_name_unique").on(
			t.userId,
			sql`lower(${t.name})`,
		),
		index("idx_saved_views_user").on(t.userId),
	],
);
