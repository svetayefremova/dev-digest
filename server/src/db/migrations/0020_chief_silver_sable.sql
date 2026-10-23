CREATE TABLE IF NOT EXISTS "onboarding_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"phase" text,
	"reason" text,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"duration_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "onboarding_generations_status_ck" CHECK (status in ('running','succeeded','failed'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_generations" ADD CONSTRAINT "onboarding_generations_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_generations" ADD CONSTRAINT "onboarding_generations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_generations_one_running_idx" ON "onboarding_generations" USING btree ("repo_id") WHERE status = 'running';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_generations_repo_started_idx" ON "onboarding_generations" USING btree ("repo_id","started_at");
