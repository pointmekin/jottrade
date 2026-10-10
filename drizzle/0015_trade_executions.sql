CREATE TABLE "trade_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" integer NOT NULL,
	"trade_id" integer NOT NULL,
	"kind" text NOT NULL,
	"executed_at" timestamp NOT NULL,
	"price" numeric NOT NULL,
	"quantity" numeric NOT NULL,
	"fees" numeric DEFAULT '0' NOT NULL,
	"exit_quote_to_account_rate" numeric,
	"realized_pnl" numeric,
	"source_trade_id" integer,
	"sequence" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "execution_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "grouped_into_id" integer;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_source_trade_id_trades_id_fk" FOREIGN KEY ("source_trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_trade_executions_trade" ON "trade_executions" USING btree ("trade_id","executed_at","sequence");--> statement-breakpoint
CREATE INDEX "idx_trade_executions_portfolio" ON "trade_executions" USING btree ("portfolio_id","executed_at");--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_grouped_into_id_trades_id_fk" FOREIGN KEY ("grouped_into_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;