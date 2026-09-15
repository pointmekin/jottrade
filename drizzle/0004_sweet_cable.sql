DELETE FROM "cash_flows" WHERE "portfolio_id" IS NULL;--> statement-breakpoint
DELETE FROM "trades" WHERE "portfolio_id" IS NULL;--> statement-breakpoint
ALTER TABLE "cash_flows" ALTER COLUMN "portfolio_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ALTER COLUMN "portfolio_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "kind" text DEFAULT 'REAL' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_cash_flows_portfolio" ON "cash_flows" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "idx_trades_portfolio" ON "trades" USING btree ("portfolio_id");
