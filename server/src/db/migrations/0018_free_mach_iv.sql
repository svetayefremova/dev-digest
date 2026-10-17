ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "out_of_scope" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "confidence" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "missing_context" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "head_sha" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "provider" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "model" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "run_id" uuid;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "detected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "label" text;--> statement-breakpoint
ALTER TABLE "pr_intent" DROP CONSTRAINT IF EXISTS "pr_intent_run_id_agent_runs_id_fk";--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_intent" DROP CONSTRAINT IF EXISTS "pr_intent_confidence_ck";--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_confidence_ck" CHECK ("pr_intent"."confidence" in ('high','medium','low'));