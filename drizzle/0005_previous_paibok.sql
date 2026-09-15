DELETE FROM "portfolios" p USING "portfolios" q WHERE p."user_id" = q."user_id" AND p."is_default" AND q."is_default" AND p."id" > q."id";--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_user_default_unique" ON "portfolios" USING btree ("user_id") WHERE is_default;
