CREATE TABLE "agent_run_skills" (
	"run_id" uuid NOT NULL,
	"skill_id" uuid,
	"skill_name" text NOT NULL,
	"skill_version" integer NOT NULL,
	"tokens" integer NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "agent_run_skills_run_id_order_pk" PRIMARY KEY("run_id","order")
);
--> statement-breakpoint
-- Some local databases already carry a nullable, default-less "message" column
-- (created by another checkout sharing the dev Postgres). Add it only when it is
-- missing, then converge both cases on NOT NULL DEFAULT ''.
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "message" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "skill_versions" SET "message" = '' WHERE "message" IS NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "message" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "message" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_run_skills" ADD CONSTRAINT "agent_run_skills_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_skills" ADD CONSTRAINT "agent_run_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_skills_skill_idx" ON "agent_run_skills" USING btree ("skill_id");