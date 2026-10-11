import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import { ruleKey, type VerifiedCandidate } from './helpers.js';

/**
 * Conventions data-access. Owns `conventions` and `convention_scans`.
 * Workspace-scoped throughout.
 */

export type { ConventionRow, ConventionScanRow };

export interface UpdateConvention {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** A repo's candidates, strongest first. Rejected ones are never listed. */
  async listVisible(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'rejected'),
        ),
      )
      .orderBy(desc(t.conventions.confidence), asc(t.conventions.createdAt), asc(t.conventions.id));
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    const rows = await this.listVisible(workspaceId, repoId);
    return rows.filter((row) => row.status === 'accepted');
  }

  async getScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)));
    return row;
  }

  /**
   * Store the result of a scan. The user's decisions outlive it: accepted and
   * rejected rows are kept as they are, only undecided ones are replaced, and a
   * new candidate that repeats a kept row (same rule, or same evidence line) is
   * skipped — so a rejected rule does not come back on a re-scan.
   */
  async replaceScan(
    workspaceId: string,
    repoId: string,
    candidates: VerifiedCandidate[],
    scan: { sampleFiles: number; model: string },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const scope = and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId));
      await tx.delete(t.conventions).where(and(scope, eq(t.conventions.status, 'pending')));
      const kept = await tx.select().from(t.conventions).where(scope);

      const seen = new Set<string>();
      for (const row of kept) {
        seen.add(ruleKey(row.rule));
        seen.add(`${row.evidencePath}:${row.evidenceLine}`);
      }
      const fresh = candidates.filter((c) => {
        const keys = [ruleKey(c.rule), `${c.evidencePath}:${c.evidenceLine}`];
        if (keys.some((key) => seen.has(key))) return false;
        keys.forEach((key) => seen.add(key));
        return true;
      });
      if (fresh.length > 0) {
        await tx.insert(t.conventions).values(fresh.map((c) => ({ ...c, workspaceId, repoId })));
      }

      const scannedAt = new Date();
      await tx
        .insert(t.conventionScans)
        .values({ repoId, workspaceId, ...scan, scannedAt })
        .onConflictDoUpdate({ target: t.conventionScans.repoId, set: { ...scan, scannedAt } });
    });
  }

  async update(workspaceId: string, id: string, patch: UpdateConvention): Promise<ConventionRow | undefined> {
    const where = and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id));
    if (Object.values(patch).every((value) => value === undefined)) {
      const [row] = await this.db.select().from(t.conventions).where(where);
      return row;
    }
    const [row] = await this.db.update(t.conventions).set(patch).where(where).returning();
    return row;
  }

  /** Accept or un-accept every candidate still on the list (rejected ones stay rejected). */
  async setAllStatus(
    workspaceId: string,
    repoId: string,
    status: Exclude<ConventionStatus, 'rejected'>,
  ): Promise<void> {
    await this.db
      .update(t.conventions)
      .set({ status })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'rejected'),
        ),
      );
  }
}
