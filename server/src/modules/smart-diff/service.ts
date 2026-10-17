import type { SmartDiffResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff, latestPerAgent } from './build.js';

/** Application ring: loads the PR's files + reviews and delegates to the pure builder. */
export class SmartDiffService {
  constructor(private container: Container) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    const repo = this.container.reviewRepo;
    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, reviews] = await Promise.all([repo.getPrFiles(prId), repo.reviewsForPull(prId)]);

    const latest = latestPerAgent(
      reviews.map(({ review, findings }) => ({
        agentId: review.agentId,
        createdAt: review.createdAt,
        findings: findings.map((f) => ({ file: f.file, startLine: f.startLine })),
      })),
    );

    return buildSmartDiff(
      files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })),
      latest.flatMap((r) => r.findings),
    );
  }
}
