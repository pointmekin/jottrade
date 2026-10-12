CREATE TABLE "review_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"period_start" date NOT NULL,
	"period_end_exclusive" date NOT NULL,
	"timezone_snapshot" text NOT NULL,
	"week_starts_on_snapshot" integer NOT NULL,
	"currency_snapshot" text NOT NULL,
	"template_version" integer DEFAULT 1 NOT NULL,
	"intent" text DEFAULT '' NOT NULL,
	"execution" text DEFAULT '' NOT NULL,
	"lesson" text DEFAULT '' NOT NULL,
	"next_action" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"commitment_reflection" text DEFAULT '' NOT NULL,
	"previous_review_id" integer,
	"previous_commitment_snapshot" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"result_snapshot" jsonb,
	CONSTRAINT "review_period_dates" CHECK ("review_periods"."period_end_exclusive" > "review_periods"."period_start"),
	CONSTRAINT "review_period_kind" CHECK ("review_periods"."kind" in ('DAILY','WEEKLY')),
	CONSTRAINT "review_period_status" CHECK ("review_periods"."status" in ('DRAFT','COMPLETE'))
);
--> statement-breakpoint
CREATE TABLE "review_source_cash_flows" (
	"review_id" integer NOT NULL,
	"cash_flow_id" integer NOT NULL,
	"execution_fingerprint" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"included_in_snapshot" boolean DEFAULT false NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_source_cash_flows_review_id_cash_flow_id_pk" PRIMARY KEY("review_id","cash_flow_id")
);
--> statement-breakpoint
CREATE TABLE "review_source_trades" (
	"review_id" integer NOT NULL,
	"trade_id" integer NOT NULL,
	"execution_fingerprint" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"included_in_snapshot" boolean DEFAULT false NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_source_trades_review_id_trade_id_pk" PRIMARY KEY("review_id","trade_id")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'staged' NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"source_currency" text NOT NULL,
	"parser_version" integer DEFAULT 2 NOT NULL,
	"rows" jsonb NOT NULL,
	"outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"committed_at" timestamp,
	"undone_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "import_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" integer NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"occurrence" integer DEFAULT 0 NOT NULL,
	"trade_id" integer,
	"cash_flow_id" integer,
	"recorded_record_id" integer NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"batch_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_flows" ADD COLUMN "edit_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD COLUMN "broker_source" text;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD COLUMN "broker_adjustment" jsonb;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "review_timezone" text;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "review_week_starts_on" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "initial_stop_price" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "initial_target_price" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "initial_risk_amount" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "initial_risk_percent" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "initial_risk_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "management_stop_price" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "risk_correction_history" jsonb;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "exit_quote_to_account_rate" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "pnl_calculation_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "edit_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "annotation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "reviewed_execution_fingerprint" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "broker_source" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "broker_ticket" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "broker_profit" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "broker_commission" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "broker_swap" numeric;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "broker_close_reason" text;--> statement-breakpoint
ALTER TABLE "review_periods" ADD CONSTRAINT "review_periods_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_periods" ADD CONSTRAINT "review_periods_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_source_cash_flows" ADD CONSTRAINT "review_source_cash_flows_review_id_review_periods_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_source_cash_flows" ADD CONSTRAINT "review_source_cash_flows_cash_flow_id_cash_flows_id_fk" FOREIGN KEY ("cash_flow_id") REFERENCES "public"."cash_flows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_source_trades" ADD CONSTRAINT "review_source_trades_review_id_review_periods_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_source_trades" ADD CONSTRAINT "review_source_trades_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_identities" ADD CONSTRAINT "import_identities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_identities" ADD CONSTRAINT "import_identities_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_identities" ADD CONSTRAINT "import_identities_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_identities" ADD CONSTRAINT "import_identities_cash_flow_id_cash_flows_id_fk" FOREIGN KEY ("cash_flow_id") REFERENCES "public"."cash_flows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_identities" ADD CONSTRAINT "import_identities_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_period_identity" ON "review_periods" USING btree ("portfolio_id","kind","period_start");--> statement-breakpoint
CREATE INDEX "review_source_flow_lookup" ON "review_source_cash_flows" USING btree ("cash_flow_id");--> statement-breakpoint
CREATE INDEX "review_source_trade_lookup" ON "review_source_trades" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "idx_import_batches_account" ON "import_batches" USING btree ("user_id","portfolio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_identity_account_version_unique" ON "import_identities" USING btree ("user_id","portfolio_id","kind","fingerprint","occurrence");--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_review_week_start" CHECK ("portfolios"."review_week_starts_on" in (0, 1));