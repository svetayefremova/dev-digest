import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { PollingRepository } from './repository.js';

export interface PollResult {
  synced: number;
  reviewTriggered: false;
}

/**
 * F1 — polling service. MANUAL refresh that ONLY syncs the PR list
 * (new/updated PRs appear, head_sha updates). It does NOT trigger any review —
 * review is manual (user presses Run Review, owned by A2).
 *
 * No HTTP and no raw SQL live here — persistence goes through
 * PollingRepository.
 */
export class PollingService {
  private repo: PollingRepository;

  constructor(private container: Container) {
    this.repo = new PollingRepository(container.db);
  }

  async poll(workspaceId: string, repoId: string): Promise<PollResult> {
    const repo = await this.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.container.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    await this.repo.upsertPulls(workspaceId, repo.id, pulls);
    await this.repo.markPolled(repo.id);

    // NOTE: no review is triggered here — manual trigger only.
    return { synced: pulls.length, reviewTriggered: false };
  }
}
