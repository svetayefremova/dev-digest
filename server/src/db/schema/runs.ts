import { pgTable, uuid, text, integer, jsonb, timestamp, numeric, index, primaryKey } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';
import { skills } from './skills';

// ============================================================ Observability

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** Display name for runs with no agent (e.g. 'Intent classifier'); null for agent runs. */
    label: text('label'),
    prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    provider: text('provider'),
    model: text('model'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    /** Money: NUMERIC, never float — avoids binary rounding drift on SUM(cost_usd). */
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
    status: text('status'),
    /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
    error: text('error'),
    source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
    findingsCount: integer('findings_count'),
    grounding: text('grounding'),
    /** Review score (0-100) for this run; null on failed/cancelled runs. */
    score: integer('score'),
    /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
    blockers: integer('blockers'),
  },
  (t) => ({
    wsIdx: index('agent_runs_ws_idx').on(t.workspaceId),
    agentIdx: index('agent_runs_agent_idx').on(t.agentId),
    // `listRunsForPull`/`activeRunsForPull` filter on (workspaceId, prId) for every PR-detail load.
    prIdx: index('agent_runs_pr_idx').on(t.prId),
  }),
);

/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

/**
 * The skill blocks that actually went into one run's prompt, in prompt order.
 * A snapshot, not a live link: name/version/tokens are frozen at run time and
 * the row outlives the skill (`skill_id` goes null when the skill is deleted).
 * Skill stats attribute runs — and their findings — to skills through this.
 */
export const agentRunSkills = pgTable(
  'agent_run_skills',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    skillName: text('skill_name').notNull(),
    skillVersion: integer('skill_version').notNull(),
    tokens: integer('tokens').notNull(),
    order: integer('order').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.order] }),
    skillIdx: index('agent_run_skills_skill_idx').on(t.skillId),
  }),
);

export const multiAgentRuns = pgTable(
  'multi_agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    wsIdx: index('multi_agent_runs_ws_idx').on(t.workspaceId),
    prIdx: index('multi_agent_runs_pr_idx').on(t.prId),
  }),
);
