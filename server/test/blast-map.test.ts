import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { toBlastRadius, emptyBlastRadius } from '../src/modules/blast/map.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

const sorted = (xs: string[]) => [...xs].sort();

function baseResult(): BlastResult {
  return {
    changedSymbols: [
      { file: 'src/a.ts', name: 'alpha', kind: 'function' },
      { file: 'src/b.ts', name: 'beta', kind: 'function' },
    ],
    callers: [
      { file: 'src/x.ts', symbol: 'handleX', viaSymbol: 'alpha', line: 3, rank: 9 },
      { file: 'src/y.ts', symbol: 'runY', viaSymbol: 'alpha', line: 9, rank: 5 },
      { file: 'src/y.ts', symbol: 'runY2', viaSymbol: 'beta', line: 20, rank: 5 },
    ],
    impactedEndpoints: [],
    factsByFile: {
      'src/x.ts': { endpoints: ['GET /a'], crons: [] },
      'src/y.ts': { endpoints: ['GET /a', 'POST /b'], crons: ['0 * * * *'] },
    },
    degraded: false,
  };
}

describe('toBlastRadius (T1)', () => {
  it('RQ-T1: groups flat callers per changed symbol with deduped endpoints/crons and a summary', () => {
    const out = toBlastRadius(baseResult());

    expect(out.downstream.map((d) => d.symbol)).toEqual(['alpha', 'beta']);
    const [alpha, beta] = out.downstream;
    expect(alpha!.callers).toEqual([
      { name: 'handleX', file: 'src/x.ts', line: 3 },
      { name: 'runY', file: 'src/y.ts', line: 9 },
    ]);
    expect(beta!.callers).toEqual([{ name: 'runY2', file: 'src/y.ts', line: 20 }]);
    expect(sorted(alpha!.endpoints_affected)).toEqual(['GET /a', 'POST /b']);
    expect(alpha!.crons_affected).toEqual(['0 * * * *']);
    expect(sorted(beta!.endpoints_affected)).toEqual(['GET /a', 'POST /b']);
    expect(beta!.crons_affected).toEqual(['0 * * * *']);
    expect(out.changed_symbols).toEqual([
      { name: 'alpha', file: 'src/a.ts', kind: 'function' },
      { name: 'beta', file: 'src/b.ts', kind: 'function' },
    ]);
    expect(out.summary).toBe('2 symbols · 3 callers · 2 endpoints · 1 crons');
    expect(BlastRadiusResponse.safeParse(out).success).toBe(true);
  });

  it('RQ-T1: a changed symbol without callers is absent from downstream but stays in changed_symbols', () => {
    const r = baseResult();
    r.callers = r.callers.filter((c) => c.viaSymbol === 'alpha');
    const out = toBlastRadius(r);
    expect(out.downstream.map((d) => d.symbol)).toEqual(['alpha']);
    expect(out.changed_symbols.map((s) => s.name)).toEqual(['alpha', 'beta']);
  });

  it('RQ-T1: without factsByFile (fallback path) endpoints and crons are empty', () => {
    const r = baseResult();
    delete r.factsByFile;
    const out = toBlastRadius(r);
    expect(out.downstream).toHaveLength(2);
    for (const d of out.downstream) {
      expect(d.callers.length).toBeGreaterThan(0);
      expect(d.endpoints_affected).toEqual([]);
      expect(d.crons_affected).toEqual([]);
    }
  });

  it('RQ-T1: degraded/reason are passed through; undefined becomes false/null', () => {
    const degraded = toBlastRadius({ ...baseResult(), degraded: true, reason: 'index_partial' });
    expect(degraded.degraded).toBe(true);
    expect(degraded.reason).toBe('index_partial');

    const r = baseResult();
    delete r.degraded;
    delete r.reason;
    const plain = toBlastRadius(r);
    expect(plain.degraded).toBe(false);
    expect(plain.reason).toBeNull();
  });

  it('F1: no_changed_files is a valid reason and the empty helper is degraded with no symbols or downstream', () => {
    const out = emptyBlastRadius('no_changed_files');
    expect(out.changed_symbols).toEqual([]);
    expect(out.downstream).toEqual([]);
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_changed_files');
    expect(BlastRadiusResponse.safeParse(out).success).toBe(true);
  });
});
