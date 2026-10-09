CREATE TABLE "saved_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" integer,
	"name" text NOT NULL,
	"scope" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_user_name_unique" ON "saved_views" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "idx_saved_views_user" ON "saved_views" USING btree ("user_id");