ALTER TABLE "strategies" ADD COLUMN "criteria" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "risk_guidance" text;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "criteria_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "playbook_check" jsonb;