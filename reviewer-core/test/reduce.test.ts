/**
 * Map-reduce helpers (reduceReviews, scoreFromFindings, sliceDiff) — the
 * map-reduce review strategy chunks a diff file-by-file, runs each chunk
 * through the model, then merges partials back together via these pure
 * functions. A bug here (e.g. a chunk-boundary double-count, or the wrong
 * verdict winning) ships silently unless these are tested directly.
 */
import { describe, it, expect } from 'vitest';
import type { Finding, Review, UnifiedDiff } from '@devdigest/shared';
import { reduceReviews, sliceDiff, scoreFromFindings } from '../src/review/reduce.js';

function finding(severity: Finding['severity']): Finding {
  return {
    id: `f-${severity}`,
    severity,
    category: 'bug',
    title: 't',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
  } as Finding;
}

describe('scoreFromFindings', () => {
  it('is 100 with no findings', () => {
    expect(scoreFromFindings([])).toBe(100);
  });

  it('subtracts the per-severity penalty', () => {
    expect(scoreFromFindings([finding('SUGGESTION')])).toBe(97);
    expect(scoreFromFindings([finding('WARNING')])).toBe(88);
    expect(scoreFromFindings([finding('CRITICAL')])).toBe(65);
  });

  it('sums penalties across multiple findings', () => {
    expect(scoreFromFindings([finding('WARNING'), finding('WARNING')])).toBe(76);
  });

  it('floors at 0, never negative', () => {
    const many = Array.from({ length: 5 }, () => finding('CRITICAL'));
    expect(scoreFromFindings(many)).toBe(0);
  });
});

function review(partial: Partial<Review>): Review {
  return { verdict: 'approve', score: 100, summary: '', findings: [], ...partial } as Review;
}

describe('reduceReviews', () => {
  it('returns the single partial unchanged (same reference) when there is only one', () => {
    const only = review({ verdict: 'comment', score: 80, summary: 's', findings: [finding('WARNING')] });
    expect(reduceReviews([only])).toBe(only);
  });

  it('concatenates findings from every partial', () => {
    const a = review({ findings: [finding('WARNING')] });
    const b = review({ findings: [finding('CRITICAL'), finding('SUGGESTION')] });
    expect(reduceReviews([a, b]).findings).toHaveLength(3);
  });

  it('takes the worst verdict across partials', () => {
    const approve = review({ verdict: 'approve' });
    const comment = review({ verdict: 'comment' });
    const blockers = review({ verdict: 'request_changes' });
    expect(reduceReviews([approve, comment]).verdict).toBe('comment');
    expect(reduceReviews([approve, comment, blockers]).verdict).toBe('request_changes');
  });

  it('averages the score and rounds to the nearest integer', () => {
    const a = review({ score: 90 });
    const b = review({ score: 71 });
    expect(reduceReviews([a, b]).score).toBe(81); // (90+71)/2 = 80.5 → rounds up
  });

  it('joins non-empty summaries with a space, dropping empty ones', () => {
    const a = review({ summary: 'first part.' });
    const b = review({ summary: '' });
    const c = review({ summary: 'third part.' });
    expect(reduceReviews([a, b, c]).summary).toBe('first part. third part.');
  });
});

describe('sliceDiff', () => {
  const RAW = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,2 @@
 const a = 1;
+const extra = 2;
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,1 +1,2 @@
 const b = 1;
+const more = 2;`;

  const diff: UnifiedDiff = {
    raw: RAW,
    files: [
      { path: 'src/a.ts', additions: 1, deletions: 0, hunks: [] },
      { path: 'src/b.ts', additions: 1, deletions: 0, hunks: [] },
    ],
  } as UnifiedDiff;

  it("extracts only the targeted file's block from the raw diff", () => {
    const slice = sliceDiff(diff, 'src/b.ts');
    expect(slice).toContain('const more = 2;');
    expect(slice).not.toContain('const extra = 2;');
    expect(slice.startsWith('diff --git a/src/b.ts')).toBe(true);
  });

  it('synthesizes a minimal header when the file is known but absent from raw', () => {
    const noMatch: UnifiedDiff = {
      raw: 'diff --git a/unrelated.ts b/unrelated.ts',
      files: diff.files,
    } as UnifiedDiff;
    const slice = sliceDiff(noMatch, 'src/a.ts');
    expect(slice).toBe('diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts');
  });

  it('falls back to the whole raw diff when the path is unknown entirely', () => {
    const slice = sliceDiff(diff, 'src/missing.ts');
    expect(slice).toBe(diff.raw);
  });
});
