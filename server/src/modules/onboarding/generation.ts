import { OnboardingTour, type OnboardingReason } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ExternalServiceError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { withTimeout } from '../../platform/resilience.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { readExcerpts } from './checkout.js';
import { EXCERPT_FILES, LLM_TIMEOUT_MS, SCHEMA_NAME } from './constants.js';
import { loadTourFacts } from './facts.js';
import {
  buildAllowlist,
  buildSkeleton,
  deriveCommands,
  groundModelOutput,
  mergeGenerated,
  readingCandidates,
  redactCompose,
  redactPackageJson,
  redactText,
} from './helpers.js';
import { OnboardingModelOutput } from './model-output.js';
import { buildModelMessages } from './prompt-input.js';
import type { OnboardingRepository } from './repository.js';
import type { Excerpt } from './types.js';

export interface GenerationDeps {
  container: Container;
  repository: OnboardingRepository;
  log: PinoLike;
}

interface Outcome {
  status: 'succeeded' | 'failed';
  reason?: OnboardingReason;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
}

/**
 * Run one generation: facts -> exactly one structured model call -> grounding ->
 * persist. Never throws (JobRunner would retry the handler). On failure the
 * previously persisted tour stays untouched.
 */
export async function runGeneration(
  deps: GenerationDeps,
  generationId: string,
  opts: { timeoutMs?: number } = {},
): Promise<void> {
  const { repository, log } = deps;
  const startedMs = Date.now();
  let repoId = '';
  let outcome: Outcome;
  try {
    const row = await repository.getById(generationId);
    if (!row || row.status !== 'running') return;
    repoId = row.repoId;
    outcome = await execute(deps, row.workspaceId, row.repoId, generationId, opts.timeoutMs ?? LLM_TIMEOUT_MS);
  } catch {
    outcome = { status: 'failed', reason: 'ai_unavailable' };
  }
  const durationMs = Date.now() - startedMs;
  try {
    await repository.finish(generationId, { ...outcome, durationMs });
  } catch (err) {
    log.error({ generationId, err: err instanceof Error ? err.message : 'finish failed' }, 'onboarding finish failed');
  }
  // Allowlisted fields only: never details, raw model text or excerpts (AC-44).
  log.info(
    {
      generationId,
      repoId,
      status: outcome.status,
      reason: outcome.reason ?? null,
      durationMs,
      tokensIn: outcome.tokensIn ?? null,
      tokensOut: outcome.tokensOut ?? null,
      model: outcome.model ?? null,
    },
    'onboarding generation finished',
  );
}

async function execute(
  deps: GenerationDeps,
  workspaceId: string,
  repoId: string,
  generationId: string,
  timeoutMs: number,
): Promise<Outcome> {
  const { container, repository } = deps;
  await repository.setPhase(generationId, 'generating');

  const repo = await container.reposRepo.getById(workspaceId, repoId);
  if (!repo?.clonePath) return { status: 'failed', reason: 'no_data' };

  const facts = await loadTourFacts(container, repoId, repo.clonePath);
  if (!container.config.repoIntelEnabled) return { status: 'failed', reason: 'flag_off' };
  const state = await container.repoIntel.getIndexState(repoId);
  if (state.status === 'failed') return { status: 'failed', reason: 'index_failed' };
  if (state.reason === 'no_data' || state.degradedReason === 'no_data') {
    return { status: 'failed', reason: 'no_data' };
  }
  if (facts.index.filesIndexed === 0) return { status: 'failed', reason: 'no_supported_files' };

  const skeleton = buildSkeleton(facts, null);
  const { provider, model } = await resolveFeatureModel(container, workspaceId, 'onboarding');

  const readingPaths = readingCandidates(facts.intel)
    .slice(0, EXCERPT_FILES)
    .map((c) => c.path);
  const excerpts: Excerpt[] = [];
  const secrets: string[] = [];
  const add = (label: string, r: { text: string; secrets: string[] }) => {
    secrets.push(...r.secrets);
    if (r.text !== '') excerpts.push({ label, text: r.text });
  };
  if (facts.run.readme) add('README', redactText(facts.run.readme));
  if (facts.run.packageJsonText) add('package.json', redactPackageJson(facts.run.packageJsonText));
  if (facts.run.composeText && facts.run.composeFile) {
    add(facts.run.composeFile, redactCompose(facts.run.composeText));
  }
  for (const e of await readExcerpts(repo.clonePath, readingPaths)) add(e.label, redactText(e.text));
  const messages = await buildModelMessages(facts, excerpts);

  let result;
  try {
    const llm = await container.llm(provider);
    result = await withTimeout(
      llm.completeStructured({
        model,
        schema: OnboardingModelOutput,
        schemaName: SCHEMA_NAME,
        messages,
        temperature: 0.2,
        maxRetries: 0,
        timeoutMs,
      }),
      timeoutMs,
    );
  } catch (err) {
    const raw = err instanceof ExternalServiceError ? (err.details as { raw?: unknown } | undefined)?.raw : undefined;
    if (typeof raw === 'string') return { status: 'failed', reason: 'ai_output_invalid' };
    return { status: 'failed', reason: 'ai_unavailable' };
  }

  const derivedCommands = deriveCommands(facts.run);
  const grounded = groundModelOutput(result.data, {
    indexedPaths: new Set(facts.intel.indexedPaths),
    allowlist: buildAllowlist(facts.run.topLevelDirs),
    topLevelDirs: facts.run.topLevelDirs,
    derivedCommands,
    secrets,
  });
  const merged = OnboardingTour.safeParse(mergeGenerated(skeleton, grounded, facts, new Date().toISOString()));
  if (!merged.success) {
    return { status: 'failed', reason: 'ai_output_invalid', model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
  }
  await repository.upsertTour(repoId, merged.data);
  return {
    status: 'succeeded',
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}
