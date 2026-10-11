-- Some local databases already carry a narrower "skills_source_ck" (without
-- 'imported_file'); drop it first so this migration applies either way.
ALTER TABLE "skills" DROP CONSTRAINT IF EXISTS "skills_source_ck";--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_source_ck" CHECK ("skills"."source" in ('manual', 'imported_file', 'imported_url', 'extracted', 'community'));
