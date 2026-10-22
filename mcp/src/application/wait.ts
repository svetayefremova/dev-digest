import type { RunSummary } from '@devdigest/shared';
import type { DevDigestApi } from '../api/types.js';

export type WaitResult =
  | { state: 'done' | 'failed' | 'cancelled'; run: RunSummary }
  | { state: 'timeout'; run?: RunSummary | undefined };

export async function waitForRun(
  api: DevDigestApi,
  prId: string,
  runId: string,
  opts: { waitMs: number; pollMs: number; sleep: (ms: number) => Promise<void>; now: () => number },
): Promise<WaitResult> {
  const deadline = opts.now() + opts.waitMs;
  let last: RunSummary | undefined;
  for (;;) {
    const runs = await api.listRuns(prId);
    last = runs.find((r) => r.run_id === runId) ?? last;
    if (last && last.status !== 'running' && last.status !== null) {
      const state = last.status === 'done' || last.status === 'cancelled' ? last.status : 'failed';
      return { state, run: last };
    }
    if (opts.now() >= deadline) return { state: 'timeout', run: last };
    await opts.sleep(opts.pollMs);
  }
}
