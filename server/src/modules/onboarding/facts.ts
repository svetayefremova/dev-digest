import type { Container } from '../../platform/container.js';
import { readRunFacts } from './checkout.js';
import type { TourFacts } from './types.js';

/** Index facts + checkout facts for one repo. Reads only: no model, no writes. */
export async function loadTourFacts(
  container: Container,
  repoId: string,
  clonePath: string,
): Promise<TourFacts> {
  const [state, intel, run] = await Promise.all([
    container.repoIntel.getIndexState(repoId),
    container.repoIntel.getTourFacts(repoId),
    readRunFacts(clonePath),
  ]);
  return {
    index: {
      filesIndexed: state.filesIndexed,
      filesSkipped: state.filesSkipped,
      status: state.status,
      indexedSha: state.lastIndexedSha,
      indexUpdatedAt: state.updatedAt.toISOString(),
    },
    intel,
    run,
  };
}
