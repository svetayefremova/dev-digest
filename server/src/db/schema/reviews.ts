import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, check, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { agentRuns } from './runs';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /**
     * The agent_run that produced this review (links the timeline run ↔
     * review). `onDelete: 'cascade'` matches `run.repo.ts`'s `deleteAgentRun`,
     * which already deletes the matching review explicitly — this FK is the
     * safety net for any *other* delete path that doesn't know to do the same.
     */
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    wsIdx: index('reviews_ws_idx').on(t.workspaceId),
    // `reviewsForPull` filters on this for every PR-detail page load.
    prIdx: index('reviews_pr_idx').on(t.prId),
  }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    reviewIdx: index('findings_review_idx').on(t.reviewId),
    // Zod (Severity/FindingCategory/FindingKind in vendor/shared/contracts/findings.ts)
    // guards the API boundary; these CHECKs guard every other write path
    // (scripts, backfills, future admin tools) that bypasses it.
    severityCheck: check('findings_severity_check', sql`${t.severity} in ('CRITICAL','WARNING','SUGGESTION')`),
    categoryCheck: check(
      'findings_category_check',
      sql`${t.category} in ('bug','security','perf','style','test')`,
    ),
    kindCheck: check(
      'findings_kind_check',
      sql`${t.kind} in ('finding','secret_leak','lethal_trifecta','phantom','hook')`,
    ),
  }),
);

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
