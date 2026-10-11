import { z } from 'zod';
import { ConventionCategory, type ConventionCandidate, type ConventionScan } from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import { DEFAULT_SKILL_NAME, MAX_FILE_LINES, MAX_SNIPPET_LINES, MIN_QUOTE_LENGTH } from './constants.js';

/**
 * Pure helpers for the conventions module — the model's output schema, the
 * evidence check, row ⇄ DTO mapping and the merged skill body. No I/O.
 */

/** What the model returns for one scan. Nothing here is trusted until verified. */
export const ConventionExtraction = z.object({
  candidates: z.array(
    z.object({
      category: ConventionCategory,
      rule: z.string().min(1),
      evidence: z.object({
        file: z.string().min(1),
        line: z.number().int(),
        end_line: z.number().int().nullish(),
        /** The code at that line, copied verbatim — checked against the file. */
        quote: z.string().min(1),
      }),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;
export type ExtractedCandidate = ConventionExtraction['candidates'][number];

/** A candidate whose evidence was found in the file it cites. */
export interface VerifiedCandidate {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
}

/** Cut a file to the lines a scan reads. */
export function sampleLines(content: string): string[] {
  return content.split('\n').slice(0, MAX_FILE_LINES);
}

/** Render a file for the prompt with a 1-based line number on every line. */
export function numberLines(lines: string[]): string {
  return lines.map((line, i) => `${i + 1}| ${line}`).join('\n');
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Drop the indentation every non-blank line shares. */
function dedent(lines: string[]): string[] {
  const indents = lines.filter((l) => l.trim() !== '').map((l) => l.match(/^\s*/)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut));
}

/**
 * Check a candidate's evidence against the files the model was shown. It is
 * kept only when the file exists, the cited line is inside it, and the quoted
 * code really occurs in the file. Model line numbers drift, so the quote is
 * located by content (the occurrence nearest the cited line wins) and the
 * stored line and snippet come from the file itself, never from the model.
 */
export function verifyEvidence(
  candidate: ExtractedCandidate,
  files: ReadonlyMap<string, string[]>,
): VerifiedCandidate | null {
  const { file, line, end_line, quote } = candidate.evidence;
  const lines = files.get(file);
  if (!lines) return null;
  if (line < 1 || line > lines.length) return null;

  const quoted = quote.split('\n').map(squash).filter(Boolean);
  const first = quoted[0];
  if (!first || first.length < MIN_QUOTE_LENGTH) return null;

  let start = -1;
  lines.forEach((text, i) => {
    if (!squash(text).includes(first)) return;
    if (start === -1 || Math.abs(i + 1 - line) < Math.abs(start + 1 - line)) start = i;
  });
  if (start === -1) return null;

  const claimed = end_line && end_line >= line ? end_line - line + 1 : 1;
  const length = Math.min(Math.max(quoted.length, claimed), MAX_SNIPPET_LINES, lines.length - start);
  return {
    category: candidate.category,
    rule: candidate.rule.trim(),
    evidencePath: file,
    evidenceLine: start + 1,
    evidenceEndLine: start + length,
    evidenceSnippet: dedent(lines.slice(start, start + length)).join('\n'),
    confidence: candidate.confidence,
  };
}

/** Rule text reduced to what makes two rules "the same" across scans. */
export function ruleKey(rule: string): string {
  return squash(rule).toLowerCase().replace(/[.!]+$/, '');
}

export function toCandidateDto(row: ConventionRow): ConventionCandidate {
  const line = row.evidenceLine ?? 1;
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line: line,
    evidence_end_line: row.evidenceEndLine ?? line,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status,
  };
}

export function toScanDto(
  repoId: string,
  scan: ConventionScanRow | undefined,
  rows: ConventionRow[],
): ConventionScan {
  return {
    repo_id: repoId,
    sample_files: scan?.sampleFiles ?? 0,
    scanned_at: scan?.scannedAt.toISOString() ?? null,
    candidates: rows.map(toCandidateDto),
  };
}

/** `path:line` or `path:start-end`, as cited in the UI and in the skill body. */
export function evidenceRef(row: Pick<ConventionRow, 'evidencePath' | 'evidenceLine' | 'evidenceEndLine'>): string {
  const start = row.evidenceLine ?? 1;
  const end = row.evidenceEndLine ?? start;
  return `${row.evidencePath}:${end > start ? `${start}-${end}` : start}`;
}

/** A short heading slug for a rule: its first few words, kebab-cased. */
export function ruleSlug(rule: string): string {
  const words = rule
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 5).join('-') || 'rule';
}

/** The fence must be longer than any backtick run inside the snippet. */
function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** Name, description and markdown body of the skill the accepted rules merge into. */
export function buildSkillDraft(
  repoName: string,
  accepted: ConventionRow[],
): { name: string; description: string; body: string } {
  const count = accepted.length;
  const sections = accepted.map((row) => {
    const snippet = row.evidenceSnippet ?? '';
    const fence = fenceFor(snippet);
    return [
      `## ${ruleSlug(row.rule)}`,
      row.rule,
      '',
      `Detected in \`${evidenceRef(row)}\`:`,
      '',
      fence,
      snippet,
      fence,
    ].join('\n');
  });
  return {
    name: DEFAULT_SKILL_NAME,
    description: `${count} house ${count === 1 ? 'convention' : 'conventions'} extracted from ${repoName}`,
    body: [
      `# ${DEFAULT_SKILL_NAME}`,
      '',
      `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
      '',
      sections.join('\n\n'),
    ].join('\n'),
  };
}
