import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, doublePrecision, numeric, index } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  inputDiff: text('input_diff'),
  inputFiles: jsonb('input_files'),
  inputMeta: jsonb('input_meta'),
  expectedOutput: jsonb('expected_output'),
  notes: text('notes'),
});

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    /** Money: NUMERIC, never float — see schema/runs.ts. */
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
  },
  (t) => ({ caseIdx: index('eval_runs_case_idx').on(t.caseId) }),
);

export const conformanceChecks = pgTable(
  'conformance_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    specId: text('spec_id').notNull(),
    completenessPct: doublePrecision('completeness_pct'),
    items: jsonb('items'),
  },
  (t) => ({ prIdx: index('conformance_checks_pr_idx').on(t.prId) }),
);

export const composedReviews = pgTable(
  'composed_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    verdict: text('verdict'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    githubReviewId: text('github_review_id'),
  },
  (t) => ({ prIdx: index('composed_reviews_pr_idx').on(t.prId) }),
);
