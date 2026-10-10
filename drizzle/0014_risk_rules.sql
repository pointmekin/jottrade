CREATE TABLE "risk_rule_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" integer NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"timezone" text NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "rule_check" jsonb;--> statement-breakpoint
ALTER TABLE "risk_rule_versions" ADD CONSTRAINT "risk_rule_versions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_rule_versions" ADD CONSTRAINT "risk_rule_versions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "risk_rule_versions_portfolio_version_unique" ON "risk_rule_versions" USING btree ("portfolio_id","version");--> statement-breakpoint
CREATE INDEX "idx_risk_rule_versions_portfolio_effective" ON "risk_rule_versions" USING btree ("portfolio_id","effective_from");