import type { BlastRadiusResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { emptyBlastRadius, toBlastRadius } from './map.js';

/** Application ring: resolves the PR's changed paths and asks repo-intel once. */
export class BlastService {
  constructor(private container: Container) {}

  async get(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const repo = this.container.reviewRepo;
    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await repo.getPrFiles(prId);
    const paths = files.map((f) => f.path);
    if (paths.length === 0) return emptyBlastRadius('no_changed_files');
    const result = await this.container.repoIntel.getBlastRadius(pull.repoId, paths);
    return toBlastRadius(result);
  }
}
