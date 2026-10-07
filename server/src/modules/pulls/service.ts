import type { Container } from '../../platform/container.js';
import type { PrMeta, PrDetail, GitHubClient, PrReviewComment, PrCommentInput } from '@devdigest/shared';
import { PullsRepository } from './repository.js';
import { deriveReviewStatus } from './status.js';
import { AppError, NotFoundError } from '../../platform/errors.js';

/** Matches the shape of Fastify/pino's `log.warn(obj, msg)` — kept generic so
 *  this service doesn't need to import fastify. */
export type WarnFn = (obj: { err: unknown; [key: string]: unknown }, msg: string) => void;

const noopWarn: WarnFn = () => {};

const BACKFILL_LIMIT = 10;

/**
 * F1 — pulls service. PR import via Octokit (list + per-PR detail) and the
 * proxied inline-comments actions. No HTTP and no raw SQL live here —
 * persistence goes through PullsRepository.
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export class PullsService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  /**
   *   GET /repos/:id/pulls → list PRs for a repo (open + recently merged/closed,
   *   synced from GitHub, persisted). `status` is GitHub's merge state.
   */
  async listForRepo(workspaceId: string, repoId: string, warn: WarnFn = noopWarn): Promise<PrMeta[]> {
    const repoRow = await this.repo.findRepoInWorkspace(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await this.container.github();
    } catch (err) {
      warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repoRow.owner, name: repoRow.name });
        await this.repo.upsertPulls(workspaceId, repoRow.id, pulls);
      } catch (err) {
        warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.repo.listByRepo(repoRow.id);

    // Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs
    // land with zeroed size/diff. Backfill them once from the detail endpoint
    // so the list shows real S/M/L + ± counts. Capped per request (each backfill
    // is a detail fetch) — the periodic refetch chips away at any remainder.
    // Run the backfills concurrently (independent per-PR fetch+update, no
    // shared state) instead of one-at-a-time — up to BACKFILL_LIMIT sequential
    // GitHub round-trips otherwise turns this GET into a multi-second request.
    if (gh) {
      const client = gh;
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      await Promise.allSettled(
        needStats.map(async (r) => {
          try {
            const detail = await client.getPullRequest({ owner: repoRow.owner, name: repoRow.name }, r.number);
            await this.repo.updateDiffStats(r.id, {
              additions: detail.additions,
              deletions: detail.deletions,
              filesCount: detail.files_count,
            });
            r.additions = detail.additions;
            r.deletions = detail.deletions;
            r.filesCount = detail.files_count;
          } catch (err) {
            warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
          }
        }),
      );
    }

    // Latest-review SCORE and latest-run COST per PR, for the list's score
    // ring / cost column. Computed on read (no FK denorm); the list is small,
    // so a couple of IN-queries + JS grouping is cheap.
    const prIds = rows.map((r) => r.id);
    const [latestReviewByPr, latestRunCostByPr] = await Promise.all([
      this.repo.latestReviewScoreByPr(prIds),
      this.repo.latestRunCostByPr(prIds),
    ]);

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ?? null,
        cost_usd: latestRunCostByPr.get(r.id) ?? null,
      };
    });
  }

  /** GET /pulls/:id — full PR detail (diff/files, commits, body, linked issue). */
  async getDetail(workspaceId: string, prId: string, warn: WarnFn = noopWarn): Promise<PrDetail> {
    const pr = await this.repo.findPrInWorkspace(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.findRepoById(pr.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline.
    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repoRow.owner, name: repoRow.name }, pr.number);

      await this.repo.replacePrFiles(
        pr.id,
        detail.files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      );
      await this.repo.replacePrCommits(
        pr.id,
        detail.commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committed_at ? new Date(c.committed_at) : null,
        })),
      );
      await this.repo.updatePrDetail(pr.id, {
        body: detail.body ?? null,
        // Diff stats aren't on GitHub's PR-list payload — backfill them from
        // the detail fetch so the Pull Requests list shows real size/files.
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });

      return { ...detail, id: pr.id };
    } catch (err) {
      warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const [files, commits] = await Promise.all([
        this.repo.getPrFiles(pr.id),
        this.repo.getPrCommits(pr.id),
      ]);
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  }

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.

  private async resolvePrAndRepo(workspaceId: string, prId: string) {
    const pr = await this.repo.findPrInWorkspace(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.findRepoById(pr.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    return { pr, repo: repoRow };
  }

  async getComments(workspaceId: string, prId: string, warn: WarnFn = noopWarn): Promise<PrReviewComment[]> {
    const { pr, repo: repoRow } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch (err) {
      warn({ err }, 'GitHub client unavailable; serving no PR comments');
      return [];
    }
    try {
      return await gh.listReviewComments({ owner: repoRow.owner, name: repoRow.name }, pr.number);
    } catch (err) {
      warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async postComment(workspaceId: string, prId: string, input: PrCommentInput): Promise<PrReviewComment> {
    const { pr, repo: repoRow } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repoRow.owner, name: repoRow.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}
