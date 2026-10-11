CREATE TABLE "convention_scans" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sample_files" integer NOT NULL,
	"model" text NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Some local databases already carry these columns and CHECK constraints
-- (created by another checkout sharing the dev Postgres). Every statement on
-- "conventions" is written to converge on both a fresh DB and a drifted one.
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "evidence_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "evidence_end_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "convention_scans" ADD CONSTRAINT "convention_scans_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_scans" ADD CONSTRAINT "convention_scans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conventions" DROP CONSTRAINT IF EXISTS "conventions_category_ck";--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_category_ck" CHECK ("conventions"."category" in ('naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general'));--> statement-breakpoint
ALTER TABLE "conventions" DROP CONSTRAINT IF EXISTS "conventions_status_ck";--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_status_ck" CHECK ("conventions"."status" in ('pending', 'accepted', 'rejected'));--> statement-breakpoint
-- Carry the old boolean over before 0017 drops it (absent on a drifted DB).
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conventions' AND column_name = 'accepted') THEN
		UPDATE "conventions" SET "status" = 'accepted' WHERE "accepted";
	END IF;
END $$;
