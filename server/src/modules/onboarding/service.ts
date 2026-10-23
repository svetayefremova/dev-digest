import {
  OnboardingTour,
  type GenerateOnboardingResponse,
  type OnboardingReason,
  type OnboardingTourState,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { cloneExists } from './checkout.js';
import { COOLDOWN_MS, GENERATE_JOB_KIND, GENERATION_STALE_MS } from './constants.js';
import { loadTourFacts } from './facts.js';
import { runGeneration } from './generation.js';
import { buildSkeleton } from './helpers.js';
import { OnboardingRepository, toGenerationDto, type GenerationRow } from './repository.js';

/**
 * Onboarding tour service: reads the persisted tour (never calls a model) and
 * starts at most one generation job per repo.
 */
export class OnboardingService {
  private readonly repository: OnboardingRepository;
  private log: PinoLike | null = null;

  constructor(private readonly container: Container) {
    this.repository = new OnboardingRepository(container.db);
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Register the generate job handler and fail generations orphaned by a restart. */
  registerJobHandlers(log: PinoLike): void {
    this.log = log;
    const bootTime = new Date();
    void this.repository.failStaleRunning(bootTime).catch((err: unknown) => {
      log.warn({ err: err instanceof Error ? err.message : 'failStaleRunning failed' }, 'onboarding boot cleanup failed');
    });
    this.container.jobs.register(GENERATE_JOB_KIND, async (payload) => {
      await runGeneration(
        { container: this.container, repository: this.repository, log },
        (payload as { generationId: string }).generationId,
      );
    });
  }

  async getState(workspaceId: string, repoId: string): Promise<OnboardingTourState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.repository.failStaleRunning(new Date(Date.now() - GENERATION_STALE_MS), repoId);

    const { repoIntel, config } = this.container;
    const cloned = !!repo.clonePath && (await cloneExists(repo.clonePath));
    const parsed = OnboardingTour.safeParse(await this.repository.getTourJson(repoId));
    const tour = parsed.success ? parsed.data : null;
    const latest = await this.repository.getLatest(repoId);
    const running = latest?.status === 'running' ? latest : null;
    const indexing = (await repoIntel.isIndexing(repoId)) || running?.phase === 'indexing';
    const indexState = await repoIntel.getIndexState(repoId);

    let skeleton: OnboardingTour | null = null;
    if (!tour && cloned && !indexing && repo.clonePath) {
      const facts = await loadTourFacts(this.container, repoId, repo.clonePath);
      skeleton = buildSkeleton(facts, this.skeletonReason(latest, indexState));
    }

    const stale =
      !!tour &&
      !!tour.index.indexedSha &&
      !!indexState.lastIndexedSha &&
      tour.index.indexedSha !== indexState.lastIndexedSha;

    return {
      cloned,
      repoIntelEnabled: config.repoIntelEnabled,
      indexing: !!indexing,
      tour,
      skeleton,
      latestGeneration: latest ? toGenerationDto(latest) : null,
      stale,
    };
  }

  private skeletonReason(
    latest: GenerationRow | null,
    indexState: { status: string; reason?: string; degradedReason?: string; lastIndexedSha: string },
  ): OnboardingReason | null {
    if (!this.container.config.repoIntelEnabled) return 'flag_off';
    if (latest?.status === 'failed' && latest.reason) return latest.reason as OnboardingReason;
    if (indexState.status === 'failed') return 'index_failed';
    if (indexState.reason === 'no_data' || indexState.degradedReason === 'no_data') return 'no_data';
    return null;
  }

  async startGeneration(
    workspaceId: string,
    repoId: string,
  ): Promise<GenerateOnboardingResponse & { created: boolean }> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.repository.failStaleRunning(new Date(Date.now() - GENERATION_STALE_MS), repoId);

    if (!repo.clonePath || !(await cloneExists(repo.clonePath))) {
      throw new ValidationError('Repository not cloned yet', { code: 'not_cloned' });
    }
    if (!this.container.config.repoIntelEnabled) {
      throw new AppError('repo_intel_disabled', 'Repository index is turned off', 409);
    }
    const existing = await this.repository.getRunning(repoId);
    if (existing) return { generation: toGenerationDto(existing), created: false };

    if (await this.container.repoIntel.isIndexing(repoId)) {
      throw new AppError('indexing_in_progress', 'Indexing in progress', 409);
    }
    const latest = await this.repository.getLatest(repoId);
    if (latest) {
      const elapsed = Date.now() - latest.startedAt.getTime();
      if (elapsed < COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        throw new AppError('onboarding_cooldown', `Try again in ${retryAfterSeconds}s`, 429, { retryAfterSeconds });
      }
    }

    const state = await this.container.repoIntel.getIndexState(repoId);
    const noIndex = state.reason === 'no_data' || state.degradedReason === 'no_data';
    const row = await this.repository.insertRunning(workspaceId, repoId, noIndex ? 'indexing' : 'generating');
    if (!row) {
      const raced = await this.repository.getRunning(repoId);
      if (!raced) throw new AppError('onboarding_conflict', 'Could not start generation', 409);
      return { generation: toGenerationDto(raced), created: false };
    }

    try {
      if (noIndex) {
        const { done } = await this.container.repoIntel.requestIndexBuild(workspaceId, repoId);
        done
          .then(() => this.enqueueGenerate(workspaceId, row.id))
          .catch((err: unknown) => {
            this.log?.warn(
              { generationId: row.id, err: err instanceof Error ? err.message : 'index build failed' },
              'onboarding index build failed',
            );
            return this.repository.finish(row.id, { status: 'failed', reason: 'index_failed' });
          })
          .catch(() => undefined);
      } else {
        await this.enqueueGenerate(workspaceId, row.id);
      }
    } catch {
      await this.repository.finish(row.id, { status: 'failed', reason: 'interrupted' });
      const failed = await this.repository.getById(row.id);
      return { generation: toGenerationDto(failed ?? row), created: true };
    }
    return { generation: toGenerationDto(row), created: true };
  }

  private async enqueueGenerate(workspaceId: string, generationId: string): Promise<void> {
    await this.container.jobs.enqueue(workspaceId, GENERATE_JOB_KIND, { generationId });
  }
}
