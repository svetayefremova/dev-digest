import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

/**
 * T2 — facade fixes: per-symbol caller cap (20) and `partial` index flag.
 * Unit test: the service's repository is patched with a fake, no Postgres.
 */

type Status = 'full' | 'partial';

function buildService(status: Status, callersFor: Record<string, number>): RepoIntelService {
  const container = { config: { repoIntelEnabled: true }, db: {} as never } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => ({ repoId: 'r1', status }),
    getSymbolRows: async (_repoId: string, paths: string[]) =>
      paths
        .filter((p) => p === 'src/a.ts' || p === 'src/b.ts')
        .map((p) => ({
          path: p,
          name: p === 'src/a.ts' ? 'alpha' : 'beta',
          kind: 'function',
          line: 1,
          endLine: 5,
          exported: true,
          signature: null,
        })),
    getResolvedCallers: async () =>
      Object.entries(callersFor).flatMap(([name, n]) =>
        Array.from({ length: n }, (_, i) => ({
          fromPath: `src/${name}-caller-${i}.ts`,
          toSymbol: name,
          line: 10 + i,
          rank: i,
        })),
      ),
    getFileFacts: async () => [],
  };
  return svc;
}

describe('RepoIntel.getBlastRadius persistent path (T2)', () => {
  it('RQ-T2: caps callers per changed symbol at 20 (40 total for 2 symbols), keeping rank-desc order', async () => {
    const svc = buildService('full', { alpha: 25, beta: 25 });
    const out = await svc.getBlastRadius('r1', ['src/a.ts', 'src/b.ts']);

    const alpha = out.callers.filter((c) => c.viaSymbol === 'alpha');
    const beta = out.callers.filter((c) => c.viaSymbol === 'beta');
    expect(alpha).toHaveLength(20);
    expect(beta).toHaveLength(20);
    expect(out.callers).toHaveLength(40);
    expect(alpha.map((c) => c.rank)).toEqual(Array.from({ length: 20 }, (_, i) => 24 - i));
    expect(out.degraded).toBe(false);
  });

  it('RQ-T2: a partial index keeps its data but is tagged degraded with reason index_partial', async () => {
    const svc = buildService('partial', { alpha: 2 });
    const out = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(out.callers).toHaveLength(2);
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('index_partial');
  });
});
