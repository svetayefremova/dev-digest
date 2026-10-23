import { z } from 'zod';
import { SEVERITIES } from './domain/constants.js';

const severity = z.enum(SEVERITIES);

const finding = z.object({
  severity,
  file: z.string(),
  line: z.number(),
  title: z.string(),
  message: z.string(),
  category: z.string().optional(),
  end_line: z.number().optional(),
  rationale: z.string().optional(),
  suggestion: z.string().nullable().optional(),
});

const counts = z.object({ CRITICAL: z.number(), WARNING: z.number(), SUGGESTION: z.number() });

const reviewShape = {
  agent: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().nullable(),
  findings: z.array(finding),
  total: z.number(),
  shown: z.number(),
};

export const agentsOutput = {
  agents: z.array(
    z.object({
      name: z.string(),
      id: z.string(),
      model: z.string(),
      enabled: z.boolean(),
      description: z.string(),
    }),
  ),
};

export const findingsOutput = {
  status: z.enum(['done', 'running']),
  run_id: z.string().optional(),
  repo: z.string().optional(),
  pr: z.number().optional(),
  // single-review shape
  agent: z.string().nullable().optional(),
  verdict: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  findings: z.array(finding).optional(),
  total: z.number().optional(),
  shown: z.number().optional(),
  // several agents, no `agent` given: newest review per agent
  reviews: z.array(z.object(reviewShape)).optional(),
};

export const runOutput = {
  status: z.enum(['done', 'running']),
  run_id: z.string(),
  agent: z.string(),
  repo: z.string(),
  pr: z.number(),
  attached: z.boolean().optional(),
  verdict: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  counts: counts.optional(),
  top_findings: z.array(finding).optional(),
  total: z.number().optional(),
};

export const conventionsOutput = {
  repo: z.string(),
  scanned_at: z.string().nullable(),
  conventions: z.array(
    z.object({
      category: z.string(),
      rule: z.string(),
      evidence: z.string(),
      evidence_snippet: z.string().optional(),
      confidence: z.number().optional(),
    }),
  ),
  total: z.number(),
  shown: z.number(),
  pending: z.number().optional(),
};

export const blastOutput = {
  repo: z.string(),
  pr: z.number(),
  changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string() })),
  downstream: z.array(
    z.object({
      symbol: z.string(),
      callers: z.array(z.object({ name: z.string(), file: z.string(), line: z.number() })),
      endpoints_affected: z.array(z.string()),
      crons_affected: z.array(z.string()),
    }),
  ),
  summary: z.string(),
  degraded: z.boolean(),
  reason: z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data', 'no_changed_files']).nullable(),
};
