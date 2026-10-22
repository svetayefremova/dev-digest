import type { ConventionScan, FindingRecord, ReviewRecord, Severity } from '@devdigest/shared';
import {
  DETAIL_MAX,
  MAX_TEXT_CHARS,
  MSG_MAX,
  REDACTED,
  SEVERITY_RANK,
  TOP_FINDINGS,
  UNTRUSTED_MARKER,
} from './constants.js';

export type ResponseFormat = 'concise' | 'detailed';

export interface ConciseFinding {
  severity: Severity;
  file: string;
  line: number;
  title: string;
  message: string;
}

export interface DetailedFinding extends ConciseFinding {
  category: string;
  end_line: number;
  rationale: string;
  suggestion: string | null;
}

export type ShapedFinding = ConciseFinding | DetailedFinding;

export interface ShapedReview {
  verdict: string | null;
  score: number | null;
  agent: string | null;
  findings: ShapedFinding[];
  total: number;
  shown: number;
}

export interface ReviewSummary {
  verdict: string | null;
  score: number | null;
  agent: string | null;
  counts: Record<Severity, number>;
  top_findings: ConciseFinding[];
  total: number;
}

const cut = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

function firstSentence(markdown: string): string {
  const noCode = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(noCode);
  return cut(m?.[1] ?? noCode, MSG_MAX);
}

const isSecret = (f: FindingRecord): boolean => f.kind === 'secret_leak';

function byRank(a: FindingRecord, b: FindingRecord): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    a.file.localeCompare(b.file) ||
    a.start_line - b.start_line
  );
}

function toConcise(f: FindingRecord): ConciseFinding {
  return {
    severity: f.severity,
    file: f.file,
    line: f.start_line,
    title: f.title,
    message: isSecret(f) ? REDACTED : firstSentence(f.rationale),
  };
}

function toDetailed(f: FindingRecord): DetailedFinding {
  return {
    ...toConcise(f),
    category: f.category,
    end_line: f.end_line,
    rationale: isSecret(f) ? REDACTED : cut(f.rationale, DETAIL_MAX),
    suggestion: isSecret(f) ? REDACTED : f.suggestion ? cut(f.suggestion, DETAIL_MAX) : null,
  };
}

export function shapeReview(
  review: ReviewRecord,
  opts: { severity?: Severity | undefined; limit: number; format: ResponseFormat },
): ShapedReview {
  const matching = review.findings.filter((f) => !opts.severity || f.severity === opts.severity).sort(byRank);
  const shown = matching.slice(0, opts.limit);
  return {
    verdict: review.verdict,
    score: review.score,
    agent: review.agent_name ?? null,
    findings: shown.map(opts.format === 'detailed' ? toDetailed : toConcise),
    total: matching.length,
    shown: shown.length,
  };
}

export function summarizeReview(review: ReviewRecord): ReviewSummary {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of review.findings) counts[f.severity]++;
  return {
    verdict: review.verdict,
    score: review.score,
    agent: review.agent_name ?? null,
    counts,
    top_findings: [...review.findings].sort(byRank).slice(0, TOP_FINDINGS).map(toConcise),
    total: review.findings.length,
  };
}

export function renderText(shaped: ShapedReview, header: string): string {
  const head = [`${header} — verdict ${shaped.verdict ?? 'n/a'}, score ${shaped.score ?? 'n/a'}${shaped.agent ? `, agent ${shaped.agent}` : ''}`];
  if (shaped.shown < shaped.total) {
    head.push(`Showing ${shaped.shown} of ${shaped.total} — narrow by severity/agent`);
  }
  const lines = shaped.findings.map((f) => {
    let line = `${f.severity} ${f.file}:${f.line} — ${f.title}: ${f.message}`;
    if ('rationale' in f) {
      line += `\n  rationale: ${f.rationale}`;
      if (f.suggestion) line += `\n  suggestion: ${f.suggestion}`;
    }
    return line;
  });
  return truncate([UNTRUSTED_MARKER, ...head, ...lines].join('\n'));
}

export function truncate(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n…truncated, use severity/limit`;
}

export interface ShapedConventions {
  repo: string;
  scanned_at: string | null;
  conventions: {
    category: string;
    rule: string;
    evidence: string;
    evidence_snippet?: string;
    confidence?: number;
  }[];
  total: number;
  shown: number;
}

export function shapeConventions(
  scan: ConventionScan,
  opts: { repo: string; status: 'accepted' | 'pending' | 'all'; limit: number; format: ResponseFormat },
): ShapedConventions {
  const matching = scan.candidates.filter((c) => (opts.status === 'all' ? true : c.status === opts.status));
  const shown = matching.slice(0, opts.limit);
  return {
    repo: opts.repo,
    scanned_at: scan.scanned_at,
    conventions: shown.map((c) => ({
      category: c.category,
      rule: c.rule,
      evidence: `${c.evidence_path}:${c.evidence_line}`,
      ...(opts.format === 'detailed'
        ? { evidence_snippet: cut(c.evidence_snippet, DETAIL_MAX), confidence: c.confidence }
        : {}),
    })),
    total: matching.length,
    shown: shown.length,
  };
}
