import { describe, expect, it } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, latestPerAgent } from '../src/modules/smart-diff/build.js';

describe('buildSmartDiff', () => {
  it('groups by role in display order and maps finding lines', () => {
    const files = [
      { path: 'src/a.ts', additions: 3, deletions: 1 },
      { path: 'package-lock.json', additions: 100, deletions: 50 },
      { path: 'README.md', additions: 2, deletions: 0 },
      { path: 'src/a.test.ts', additions: 5, deletions: 0 },
      { path: 'src/b.ts', additions: 1, deletions: 1 },
    ];
    const result = buildSmartDiff(files, [
      { file: 'src/a.ts', startLine: 12 },
      { file: 'src/a.ts', startLine: 3 },
      { file: 'src/a.ts', startLine: 12 },
    ]);

    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
    const core = result.groups[0]!;
    expect(core.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(core.files[0]!.finding_lines).toEqual([3, 12]);
    expect(core.files[1]!.finding_lines).toEqual([]);
    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 163, proposed_splits: [] });
    expect(() => SmartDiff.parse(result)).not.toThrow();
  });
});

describe('latestPerAgent', () => {
  it('keeps the newest review per agent regardless of input order', () => {
    const mk = (agentId: string | null, iso: string) => ({
      agentId,
      createdAt: new Date(iso),
      findings: [],
    });
    const aOld = mk('A', '2026-01-01T00:00:00Z');
    const aNew = mk('A', '2026-02-01T00:00:00Z');
    const b = mk('B', '2026-01-15T00:00:00Z');
    const out = latestPerAgent([aOld, aNew, b]);
    expect(out).toHaveLength(2);
    expect(out).toContain(aNew);
    expect(out).toContain(b);
  });
});
