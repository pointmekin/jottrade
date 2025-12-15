CREATE TABLE "portfolios" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD',
	"initial_balance" numeric DEFAULT '0',
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"portfolio_id" integer,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"status" text DEFAULT 'OPEN',
	"entry_date" timestamp NOT NULL,
	"exit_date" timestamp,
	"entry_price" numeric,
	"exit_price" numeric,
	"quantity" numeric,
	"fees" numeric DEFAULT '0',
	"net_pnl" numeric,
	"return_percent" numeric,
	"setup_id" integer,
	"mistake" text,
	"confidence" text,
	"notes" text,
	"screenshots" jsonb DEFAULT '[]'::jsonb,
	"import_hash" text,
	CONSTRAINT "trades_import_hash_unique" UNIQUE("import_hash")
);
--> statement-breakpoint
DROP TABLE "todos" CASCADE;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_trades_user" ON "trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_trades_date" ON "trades" USING btree ("entry_date");