import type { Agent, ConventionScan, PrMeta, Repo, ReviewRecord, RunSummary } from '@devdigest/shared';
import type { ActiveRun, DevDigestApi, StartReviewResponse } from './types.js';
import { ApiError, ApiUnreachableError } from './errors.js';

const REQUEST_TIMEOUT_MS = 15_000;
const PULLS_TTL_MS = 60_000;

export class HttpDevDigestApi implements DevDigestApi {
  private readonly pullsCache = new Map<string, { at: number; data: PrMeta[] }>();

  constructor(
    private readonly baseUrl: string,
    private readonly now: () => number = Date.now,
  ) {}

  listRepos(): Promise<Repo[]> {
    return this.request<Repo[]>('GET', '/repos');
  }

  async listPulls(repoId: string, opts: { bypassCache?: boolean } = {}): Promise<PrMeta[]> {
    const hit = this.pullsCache.get(repoId);
    if (!opts.bypassCache && hit && this.now() - hit.at < PULLS_TTL_MS) return hit.data;
    const data = await this.request<PrMeta[]>('GET', `/repos/${encodeURIComponent(repoId)}/pulls`);
    this.pullsCache.set(repoId, { at: this.now(), data });
    return data;
  }

  async listAgents(): Promise<Agent[]> {
    const raw = await this.request<Agent[]>('GET', '/agents');
    // Pick only what the port needs: system_prompt never leaves the adapter.
    return raw.map(
      (a) =>
        ({
          id: a.id,
          name: a.name,
          description: a.description ?? '',
          model: a.model,
          enabled: a.enabled,
        }) as Agent,
    );
  }

  startReview(prId: string, agentId: string): Promise<StartReviewResponse> {
    return this.request<StartReviewResponse>('POST', `/pulls/${encodeURIComponent(prId)}/review`, { agentId });
  }

  activeRuns(prId: string): Promise<ActiveRun[]> {
    return this.request<ActiveRun[]>('GET', `/pulls/${encodeURIComponent(prId)}/runs/active`);
  }

  listRuns(prId: string): Promise<RunSummary[]> {
    return this.request<RunSummary[]>('GET', `/pulls/${encodeURIComponent(prId)}/runs`);
  }

  reviewsForPull(prId: string): Promise<ReviewRecord[]> {
    return this.request<ReviewRecord[]>('GET', `/pulls/${encodeURIComponent(prId)}/reviews`);
  }

  conventions(repoId: string): Promise<ConventionScan> {
    return this.request<ConventionScan>('GET', `/repos/${encodeURIComponent(repoId)}/conventions`);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // ECONNREFUSED, DNS failure, timeout/abort — all mean "cannot talk to the API".
      throw new ApiUnreachableError(this.baseUrl);
    }
    if (!res.ok) {
      let code = 'http_error';
      let message = `HTTP ${res.status}`;
      try {
        const json = (await res.json()) as { error?: { code?: string; message?: string } };
        if (json.error?.code) code = json.error.code;
        if (json.error?.message) message = json.error.message;
      } catch {
        // non-JSON error body: keep defaults
      }
      throw new ApiError(res.status, code, message);
    }
    return (await res.json()) as T;
  }
}
