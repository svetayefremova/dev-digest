import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMeta } from '@devdigest/shared';

/**
 * F1 — polling data-access. The ONLY file in this module that touches the
 * DB directly.
 */
export type RepoRow = typeof t.repos.$inferSelect;

export class PollingRepository {
  constructor(private db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Upsert the PR list for a repo (idempotent on repo_id+number). */
  async upsertPulls(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
    for (const pr of pulls) {
      await this.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        })
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: {
            title: pr.title,
            headSha: pr.head_sha,
            status: pr.status,
            updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
          },
        });
    }
  }

  async markPolled(repoId: string): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: new Date() }).where(eq(t.repos.id, repoId));
  }
}
