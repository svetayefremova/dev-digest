import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index, check } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/** A convention candidate's category — kept in step with `conventions_category_ck`. */
export const CONVENTION_CATEGORIES = [
  'naming',
  'structure',
  'errors',
  'testing',
  'imports',
  'typing',
  'api',
  'general',
] as const;

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    category: text('category', { enum: CONVENTION_CATEGORIES }).notNull().default('general'),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path'),
    /** First and last line (1-based, inclusive) of the evidence in `evidencePath`. */
    evidenceLine: integer('evidence_line'),
    evidenceEndLine: integer('evidence_end_line'),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] }).notNull().default('pending'),
    createdAt: now(),
  },
  (t) => ({
    wsIdx: index('conventions_ws_idx').on(t.workspaceId),
    repoIdx: index('conventions_repo_idx').on(t.repoId),
    // Declared explicitly because some local databases already carry these
    // constraints from another checkout (see migration 0016).
    categoryCk: check(
      'conventions_category_ck',
      sql`${t.category} in ('naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general')`,
    ),
    statusCk: check('conventions_status_ck', sql`${t.status} in ('pending', 'accepted', 'rejected')`),
  }),
);

/** The last conventions scan of a repo — one row per repo, overwritten by each scan. */
export const conventionScans = pgTable('convention_scans', {
  repoId: uuid('repo_id')
    .primaryKey()
    .references(() => repos.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  /** How many files (configs + ranked samples) the scan read. */
  sampleFiles: integer('sample_files').notNull(),
  model: text('model').notNull(),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).defaultNow().notNull(),
});
