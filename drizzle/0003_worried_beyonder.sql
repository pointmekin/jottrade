ALTER TABLE "cash_flows" ADD COLUMN "kind" text DEFAULT 'DEPOSIT' NOT NULL;--> statement-breakpoint
UPDATE "cash_flows" SET "kind" = 'WITHDRAWAL' WHERE "amount" < 0;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD COLUMN "import_hash" text;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_import_hash_unique" UNIQUE("import_hash");
