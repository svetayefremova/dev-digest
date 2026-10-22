import type { FindingRecord, ReviewRecord } from '@devdigest/shared';
import { describe, expect, it } from 'vitest';
import { MAX_TEXT_CHARS } from '../src/domain/constants.js';
import { renderText, shapeReview, summarizeReview } from '../src/domain/shape.js';

const f = (i: number, severity: FindingRecord['severity'], extra: Partial<FindingRecord> = {}): FindingRecord =>
  ({
    id: `f${i}`,
    severity,
    category: 'bug',
    title: `Title ${i}`,
    file: `src/f${i}.ts`,
    start_line: i,
    end_line: i + 1,
    rationale: `First sentence ${i}. Second sentence.`,
    suggestion: 'do x',
    confidence: 0.9,
    review_id: 'rv',
    accepted_at: null,
    dismissed_at: null,
    ...extra,
  }) as FindingRecord;

const review = (findings: FindingRecord[]): ReviewRecord =>
  ({
    id: 'rv',
    pr_id: 'p',
    agent_id: 'a',
    run_id: 'run',
    agent_name: 'Sec',
    kind: 'review',
    verdict: 'request_changes',
    summary: 's',
    score: 40,
    model: 'm',
    created_at: '2026-01-01',
    cost_usd: null,
    findings,
  }) as ReviewRecord;

describe('shape', () => {
  it('limits, filters, redacts, truncates and summarizes', () => {
    const many = review(Array.from({ length: 30 }, (_, i) => f(i, i % 2 ? 'WARNING' : 'CRITICAL')));
    const s = shapeReview(many, { limit: 20, format: 'concise' });
    expect(s.shown).toBe(20);
    expect(s.total).toBe(30);
    expect(renderText(s, 'a/b#1')).toContain('Showing 20 of 30');
    expect(Object.keys(s.findings[0]!).sort()).toEqual(['file', 'line', 'message', 'severity', 'title']);
    expect(s.findings[0]!.message).toBe('First sentence 0.');

    const crit = shapeReview(many, { severity: 'CRITICAL', limit: 50, format: 'concise' });
    expect(crit.findings.every((x) => x.severity === 'CRITICAL')).toBe(true);
    expect(crit.total).toBe(15);

    const leak = review([f(1, 'CRITICAL', { kind: 'secret_leak', rationale: 'key AKIA123', suggestion: 'rotate AKIA123' })]);
    const det = JSON.stringify(shapeReview(leak, { limit: 5, format: 'detailed' }));
    expect(det).not.toContain('AKIA123');
    expect(det).toContain('redacted');

    const big = review([f(1, 'WARNING', { rationale: 'x'.repeat(100) })]);
    const shaped = shapeReview(big, { limit: 5, format: 'concise' });
    shaped.findings = Array.from({ length: 400 }, () => ({ ...shaped.findings[0]!, title: 'y'.repeat(200) }));
    const text = renderText(shaped, 'h');
    expect(text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS + 60);
    expect(text).toContain('…truncated, use severity/limit');

    const sum = summarizeReview(
      review([...Array.from({ length: 2 }, (_, i) => f(i, 'CRITICAL')), ...Array.from({ length: 5 }, (_, i) => f(10 + i, 'WARNING'))]),
    );
    expect(sum.counts).toEqual({ CRITICAL: 2, WARNING: 5, SUGGESTION: 0 });
    expect(sum.top_findings.map((x) => x.severity)).toEqual(['CRITICAL', 'CRITICAL', 'WARNING']);
  });
});
