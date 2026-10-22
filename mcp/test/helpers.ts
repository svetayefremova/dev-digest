import type { FindingRecord, ReviewRecord, RunSummary } from '@devdigest/shared';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SessionRuns } from '../src/application/session-runs.js';
import type { Deps } from '../src/application/types.js';
import type { FakeApi } from './fake-api.js';

export const RUN_UUID = '11111111-1111-4111-8111-111111111111';

export function makeDeps(api: FakeApi, over: Partial<Deps['config']> = {}): Deps & { clock: { t: number } } {
  const clock = { t: 0 };
  return {
    api,
    config: { apiUrl: 'http://localhost:3001', waitMs: 10_000, pollMs: 1000, ...over },
    sessionRuns: new SessionRuns(),
    sleep: async (ms) => {
      clock.t += ms;
    },
    now: () => clock.t,
    clock,
  };
}

export const textOf = (r: CallToolResult): string => (r.content[0] as { text: string }).text;

export const finding = (i: number, severity: FindingRecord['severity'], extra: Partial<FindingRecord> = {}): FindingRecord =>
  ({
    id: `f${i}`,
    severity,
    category: 'security',
    title: `Title ${i}`,
    file: `src/f${i}.ts`,
    start_line: i + 1,
    end_line: i + 2,
    rationale: `Reason ${i}. More detail.`,
    suggestion: 'fix it',
    confidence: 0.9,
    review_id: 'rv',
    accepted_at: null,
    dismissed_at: null,
    ...extra,
  }) as FindingRecord;

export const reviewRec = (
  runId: string,
  agentId: string,
  agentName: string,
  findings: FindingRecord[],
  created = '2026-01-01T00:00:00Z',
): ReviewRecord =>
  ({
    id: `rv-${runId}`,
    pr_id: 'p3',
    agent_id: agentId,
    run_id: runId,
    agent_name: agentName,
    kind: 'review',
    verdict: 'request_changes',
    summary: 's',
    score: 42,
    model: 'm',
    created_at: created,
    cost_usd: null,
    findings,
  }) as ReviewRecord;

export const runRow = (runId: string, agentId: string, status: string, error: string | null = null): RunSummary =>
  ({
    run_id: runId,
    agent_id: agentId,
    agent_name: 'x',
    provider: null,
    model: null,
    status,
    error,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    findings_count: null,
    grounding: null,
    ran_at: null,
    score: null,
    blockers: null,
  }) as RunSummary;
