CREATE INDEX IF NOT EXISTS "pr_commits_pr_idx" ON "pr_commits" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_files_pr_idx" ON "pr_files" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_ws_idx" ON "reviews" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_pr_idx" ON "reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_ws_idx" ON "skills" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conventions_ws_idx" ON "conventions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conventions_repo_idx" ON "conventions" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "composed_reviews_pr_idx" ON "composed_reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conformance_checks_pr_idx" ON "conformance_checks" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_runs_case_idx" ON "eval_runs" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ci_runs_installation_idx" ON "ci_runs" USING btree ("ci_installation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_ws_idx" ON "agent_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_agent_idx" ON "agent_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_pr_idx" ON "agent_runs" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "multi_agent_runs_ws_idx" ON "multi_agent_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "multi_agent_runs_pr_idx" ON "multi_agent_runs" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "digests_ws_idx" ON "digests" USING btree ("workspace_id");