import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PrIntentRecord } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

/** Intent as persisted: the transport record minus the derived `stale` flag and the pr_id key. */
export type StoredIntent = Omit<PrIntentRecord, 'pr_id' | 'stale'>;

export async function upsertIntent(db: Db, prId: string, rec: StoredIntent): Promise<void> {
  const values = {
    intent: rec.summary,
    inScope: rec.in_scope,
    outOfScope: rec.out_of_scope,
    confidence: rec.confidence,
    sources: rec.sources,
    missingContext: rec.missing_context,
    headSha: rec.head_sha,
    provider: rec.provider,
    model: rec.model,
    runId: rec.run_id,
    detectedAt: rec.detected_at ? new Date(rec.detected_at) : null,
  };
  await db
    .insert(t.prIntent)
    .values({ prId, ...values })
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
}

export async function getIntent(
  db: Db,
  prId: string,
): Promise<(StoredIntent & { pr_id: string }) | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    pr_id: row.prId,
    summary: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: (row.confidence as StoredIntent['confidence'] | null) ?? 'low',
    sources: row.sources,
    missing_context: row.missingContext,
    head_sha: row.headSha,
    provider: row.provider,
    model: row.model,
    run_id: row.runId,
    detected_at: row.detectedAt ? row.detectedAt.toISOString() : null,
  };
}
