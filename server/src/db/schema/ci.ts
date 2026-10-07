import { pgTable, uuid, text, integer, timestamp, numeric, index } from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const ciInstallations = pgTable('ci_installations', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  repo: text('repo').notNull(),
  targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
  installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status'),
    findingsCount: integer('findings_count'),
    /** Money: NUMERIC, never float — see schema/runs.ts. */
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
    githubUrl: text('github_url'),
    source: text('source'),
  },
  (t) => ({ installationIdx: index('ci_runs_installation_idx').on(t.ciInstallationId) }),
);
