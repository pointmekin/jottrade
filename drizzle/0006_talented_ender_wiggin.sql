CREATE TABLE "fx_rate_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text NOT NULL,
	"rate_key" text NOT NULL,
	"rate" numeric NOT NULL,
	"as_of" timestamp NOT NULL,
	"precision" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "quantity_unit" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "contract_size" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "base_currency" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "quote_currency" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "pnl_currency" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "entry_conversion_rate" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "entry_conversion_source" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "entry_conversion_as_of" timestamp;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "exit_conversion_rate" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "exit_conversion_source" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "exit_conversion_as_of" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rate_cache_lookup_unique" ON "fx_rate_cache" USING btree ("provider","from_currency","to_currency","rate_key");