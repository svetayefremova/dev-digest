import type { RunSummary } from '@devdigest/shared';
import { fail, type Result } from '../domain/errors.js';

export function runFailure(runId: string, run: RunSummary | undefined, status: string): Result<never> {
  return fail(
    'run_failed',
    `Run ${runId} ${status}: ${run?.error ?? 'no reason given'}`,
    "Check the agent's provider/model in DevDigest, then call run_agent_on_pr again.",
  );
}
