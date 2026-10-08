CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gray' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_tags" (
	"trade_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trade_tags_trade_id_tag_id_pk" PRIMARY KEY("trade_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_unique" ON "tags" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "idx_trade_tags_tag" ON "trade_tags" USING btree ("tag_id");