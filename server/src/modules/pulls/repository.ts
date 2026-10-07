import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMeta } from '@devdigest/shared';

/**
 * F1 — pulls data-access. The ONLY file in this module that touches the DB
 * directly.
 */
export type RepoRow = typeof t.repos.$inferSelect;
export type PullRow = typeof t.pullRequests.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type PrCommitRow = typeof t.prCommits.$inferSelect;

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

export class PullsRepository {
  constructor(private db: Db) {}

  async findRepoInWorkspace(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async findRepoById(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  async findPrInWorkspace(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async listByRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
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
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
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

  async updateDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ additions: stats.additions, deletions: stats.deletions, filesCount: stats.filesCount })
      .where(eq(t.pullRequests.id, prId));
  }

  async updatePrDetail(
    prId: string,
    values: { body: string | null } & DiffStats,
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: values.body,
        additions: values.additions,
        deletions: values.deletions,
        filesCount: values.filesCount,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  /** Latest review score per PR id (newest `kind: 'review'` row wins). */
  async latestReviewScoreByPr(prIds: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (prIds.length === 0) return out;
    const rows = await this.db
      .select({ prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
    // Rows are newest-first → first seen per PR is the latest review.
    for (const rv of rows) {
      if (!out.has(rv.prId)) out.set(rv.prId, rv.score);
    }
    return out;
  }

  /** Latest run cost per PR id (a run doesn't require a persisted review to have a cost). */
  async latestRunCostByPr(prIds: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (prIds.length === 0) return out;
    const rows = await this.db
      .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds))
      .orderBy(desc(t.agentRuns.ranAt));
    // Rows are newest-first → first seen per PR is the latest run. numeric
    // column reads back as a string — parse to the number callers expect.
    for (const run of rows) {
      if (run.prId && !out.has(run.prId)) out.set(run.prId, run.costUsd === null ? null : Number(run.costUsd));
    }
    return out;
  }

  async replacePrFiles(
    prId: string,
    files: { path: string; additions: number; deletions: number; patch: string | null }[],
  ): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length > 0) {
      await this.db.insert(t.prFiles).values(files.map((f) => ({ prId, ...f })));
    }
  }

  async replacePrCommits(
    prId: string,
    commits: { sha: string; message: string; author: string; committedAt: Date | null }[],
  ): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length > 0) {
      await this.db.insert(t.prCommits).values(commits.map((c) => ({ prId, ...c })));
    }
  }

  async getPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async getPrCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }
}
