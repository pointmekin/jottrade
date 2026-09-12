CREATE TABLE "cash_flows" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" integer,
	"occurred_at" timestamp NOT NULL,
	"amount" numeric NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cash_flows_user" ON "cash_flows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cash_flows_date" ON "cash_flows" USING btree ("occurred_at");--> statement-breakpoint
ALTER TABLE "portfolios" DROP COLUMN "initial_balance";