ALTER TABLE "eval_runs" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(10, 6);--> statement-breakpoint
ALTER TABLE "ci_runs" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(10, 6);--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(10, 6);--> statement-breakpoint
-- `reviews.agent_id`/`run_id` had no FK until now; null out any pre-existing
-- value that doesn't match a live row so the new constraints below don't fail
-- on orphaned data from before this migration existed.
UPDATE "reviews" SET "agent_id" = NULL WHERE "agent_id" IS NOT NULL AND "agent_id" NOT IN (SELECT "id" FROM "agents");--> statement-breakpoint
UPDATE "reviews" SET "run_id" = NULL WHERE "run_id" IS NOT NULL AND "run_id" NOT IN (SELECT "id" FROM "agent_runs");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_severity_check" CHECK ("findings"."severity" in ('CRITICAL','WARNING','SUGGESTION'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_category_check" CHECK ("findings"."category" in ('bug','security','perf','style','test'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_kind_check" CHECK ("findings"."kind" in ('finding','secret_leak','lethal_trifecta','phantom','hook'));