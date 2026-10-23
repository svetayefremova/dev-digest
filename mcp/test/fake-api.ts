import type { Agent, BlastRadiusResponse, ConventionScan, PrMeta, Repo, ReviewRecord, RunSummary } from '@devdigest/shared';
import type { ActiveRun, DevDigestApi, StartReviewResponse } from '../src/api/types.js';

export class FakeApi implements DevDigestApi {
  repos: Repo[] = [];
  pulls: Record<string, PrMeta[]> = {};
  agents: Agent[] = [];
  active: Record<string, ActiveRun[]> = {};
  runs: Record<string, RunSummary[]> = {};
  /** Optional hook: called on every listRuns, lets tests advance run state. */
  onListRuns?: (prId: string, call: number) => void;
  reviews: Record<string, ReviewRecord[]> = {};
  scan: ConventionScan = { repo_id: 'r1', sample_files: 0, scanned_at: null, candidates: [] };
  blasts: Record<string, BlastRadiusResponse> = {};
  blastPrIds: string[] = [];
  startError?: Error;
  startResponse?: StartReviewResponse;
  calls: string[] = [];
  private listRunsCalls = 0;

  private rec(name: string) {
    this.calls.push(name);
  }
  count(name: string) {
    return this.calls.filter((c) => c === name).length;
  }

  async listRepos() {
    this.rec('listRepos');
    return this.repos;
  }
  async listPulls(repoId: string, opts?: { bypassCache?: boolean }) {
    this.rec(opts?.bypassCache ? 'listPulls:bypass' : 'listPulls');
    return this.pulls[repoId] ?? [];
  }
  async listAgents() {
    this.rec('listAgents');
    return this.agents;
  }
  async startReview(prId: string, agentId: string) {
    this.rec('startReview');
    if (this.startError) throw this.startError;
    return this.startResponse ?? { runs: [{ run_id: `run-${prId}-${agentId}`, agent_id: agentId, agent_name: 'x' }] };
  }
  async activeRuns(prId: string) {
    this.rec('activeRuns');
    return this.active[prId] ?? [];
  }
  async listRuns(prId: string) {
    this.rec('listRuns');
    this.onListRuns?.(prId, ++this.listRunsCalls);
    return this.runs[prId] ?? [];
  }
  async reviewsForPull(prId: string) {
    this.rec('reviewsForPull');
    return this.reviews[prId] ?? [];
  }
  async conventions(_repoId: string) {
    this.rec('conventions');
    return this.scan;
  }
  async blast(prId: string) {
    this.rec('blast');
    this.blastPrIds.push(prId);
    return this.blasts[prId] ?? { changed_symbols: [], downstream: [], summary: '0 symbols', degraded: false, reason: null };
  }
}

export const repo = (full: string, id = full): Repo => {
  const [owner, name] = full.split('/') as [string, string];
  return { id, workspace_id: 'w', owner, name, full_name: full, default_branch: 'main', clone_path: null, last_polled_at: null, created_by: null };
};

export const pull = (number: number, id: string | null | undefined, title = `PR ${number}`, status: PrMeta['status'] = 'open'): PrMeta => ({
  id,
  number,
  title,
  author: 'a',
  branch: 'b',
  base: 'main',
  head_sha: 'sha',
  additions: 1,
  deletions: 0,
  files_count: 1,
  status,
});

export const agent = (name: string, id: string, enabled = true): Agent =>
  ({
    id,
    name,
    description: `${name} description`,
    provider: 'openai',
    model: 'gpt-x',
    system_prompt: 'SECRET SYSTEM PROMPT',
    enabled,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  }) as Agent;
