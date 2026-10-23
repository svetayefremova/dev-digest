import type { Agent, BlastRadiusResponse, ConventionScan, PrMeta, Repo, ReviewRecord, RunSummary } from '@devdigest/shared';

/** In-flight run row (shape of GET /pulls/:id/runs/active; no shared contract). */
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

/** Response of POST /pulls/:id/review (runs are created up front, work is async). */
export interface StartReviewResponse {
  pr_id?: string;
  runs: { run_id: string; agent_id: string; agent_name: string }[];
}

/**
 * Port to the DevDigest API. Exactly 9 methods; 8 are reads. The only write is
 * startReview, which always targets a single agent (never "all").
 */
export interface DevDigestApi {
  listRepos(): Promise<Repo[]>;
  listPulls(repoId: string, opts?: { bypassCache?: boolean }): Promise<PrMeta[]>;
  listAgents(): Promise<Agent[]>;
  startReview(prId: string, agentId: string): Promise<StartReviewResponse>;
  activeRuns(prId: string): Promise<ActiveRun[]>;
  listRuns(prId: string): Promise<RunSummary[]>;
  reviewsForPull(prId: string): Promise<ReviewRecord[]>;
  conventions(repoId: string): Promise<ConventionScan>;
  blast(prId: string): Promise<BlastRadiusResponse>;
}
