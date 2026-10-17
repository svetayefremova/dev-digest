import type { Intent, PrIntentRecord, UnifiedDiff } from '@devdigest/shared';
import { classifyIntent, computeConfidence } from '@devdigest/reviewer-core';
import type { RunTrace } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { RunLogger, type PinoLike } from '../../platform/run-logger.js';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { loadDiff } from '../reviews/diff-loader.js';
import type { PullRow } from '../reviews/repository.js';
import type { Provider } from '@devdigest/shared';
import * as schema from '../../db/schema.js';
import { SourceResolver } from './source-resolver.js';

export const CLASSIFIER_LABEL = 'Intent classifier';

type RepoRow = typeof schema.repos.$inferSelect;

/**
 * PR intent: a separate, cheap LLM call (feature model `review_intent`) that
 * works out what a PR is for, from metadata only (never diff bodies). Failure
 * is never fatal to a review — `ensureIntent` degrades to `null`.
 */
export class IntentService {
  private readonly inFlight = new Map<string, Promise<PrIntentRecord>>();

  constructor(private container: Container) {}

  private get repo() {
    return this.container.reviewRepo;
  }

  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rec = await this.repo.getIntent(prId);
    return rec ? { ...rec, stale: rec.head_sha !== pull.headSha } : null;
  }

  /** Explicit (re-)detect from the UI: loads the diff, always calls the classifier. */
  async redetect(workspaceId: string, prId: string, pino?: PinoLike): Promise<PrIntentRecord> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const diff = await loadDiff(this.container, this.repo, workspaceId, pull, repo);
    return this.detect(workspaceId, pull, repo, diff, pino);
  }

  /**
   * Intent for a review run: an existing intent (stale or not) is reused;
   * otherwise one is detected. Any failure returns `null` and the review runs
   * exactly as it did before this feature existed.
   */
  async ensureIntent(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    log?: RunLogger,
    pino?: PinoLike,
  ): Promise<PrIntentRecord | null> {
    try {
      const existing = await this.repo.getIntent(pull.id);
      if (existing) {
        const stale = existing.head_sha !== pull.headSha;
        log?.info('intent.reused', { confidence: existing.confidence, stale });
        return { ...existing, stale };
      }
      return await this.detect(workspaceId, pull, repo, diff, pino);
    } catch (err) {
      log?.info(`intent: classification unavailable — ${(err as Error).message}`);
      pino?.warn({ prId: pull.id, err: (err as Error).message }, 'intent: classification failed');
      return null;
    }
  }

  /** Classify and persist. Concurrent calls for the same PR share one LLM call. */
  detect(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    pino?: PinoLike,
  ): Promise<PrIntentRecord> {
    const running = this.inFlight.get(pull.id);
    if (running) return running;
    const p = this.runClassifier(workspaceId, pull, repo, diff, pino).finally(() =>
      this.inFlight.delete(pull.id),
    );
    this.inFlight.set(pull.id, p);
    return p;
  }

  private async runClassifier(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    pino?: PinoLike,
  ): Promise<PrIntentRecord> {
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const runId = await this.repo.createAgentRun({
      workspaceId,
      agentId: null,
      prId: pull.id,
      provider,
      model,
      label: CLASSIFIER_LABEL,
    });
    const log = new RunLogger(this.container.runBus, [runId], pino, { prId: pull.id, feature: 'review_intent' });
    const start = Date.now();

    try {
      const collected = await new SourceResolver(this.container).collect(
        pull,
        { owner: repo.owner, name: repo.name },
        diff,
      );
      const usedDocs = collected.sources.filter(
        (s) => s.kind !== 'title' && s.kind !== 'description' && s.kind !== 'files' && s.status !== 'unavailable',
      ).length;
      const unavailable = collected.sources.filter((s) => s.status === 'unavailable' && s.kind !== 'description').length;

      const llm = await this.container.llm(provider as Provider);
      const result = await classifyIntent(llm, model, collected.input).catch((err: unknown) => {
        if (err instanceof AppError) throw err;
        throw new ExternalServiceError(
          `Intent classification failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

      const confidence = computeConfidence({
        hasMeaningfulBody: collected.hasMeaningfulBody,
        usedDocs,
        unavailable,
      });
      const durationMs = Date.now() - start;

      // Metadata only: never the body, issue, doc or diff text; refs carry no query strings.
      log.tool('intent.classify', {
        provider,
        model,
        feature: 'review_intent',
        sources: collected.sources.map((s) => ({ kind: s.kind, ref: s.ref, status: s.status, chars: s.chars })),
        prompt_sections: result.promptStats,
        est_tokens_in: result.promptStats.est_tokens_in,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
        confidence,
        latency_ms: durationMs,
      });

      const intent: Intent = result.intent;
      const rec = {
        summary: intent.summary,
        in_scope: intent.in_scope,
        out_of_scope: intent.out_of_scope,
        confidence,
        sources: collected.sources,
        missing_context: collected.missing,
        head_sha: pull.headSha,
        provider,
        model,
        run_id: runId,
        detected_at: new Date().toISOString(),
      };
      await this.repo.upsertIntent(pull.id, rec);

      await this.finishRun(runId, pull, provider, model, log, {
        status: 'done',
        durationMs,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        promptStats: JSON.stringify(result.promptStats),
        raw: '',
        error: null,
      });
      return { ...rec, pr_id: pull.id, stale: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Intent classification failed: ${msg}`);
      await this.finishRun(runId, pull, provider, model, log, {
        status: 'failed',
        durationMs: Date.now() - start,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: null,
        promptStats: '',
        raw: '',
        error: msg,
      }).catch(() => undefined);
      throw err;
    }
  }

  private async finishRun(
    runId: string,
    pull: PullRow,
    provider: string,
    model: string,
    log: RunLogger,
    r: {
      status: 'done' | 'failed';
      durationMs: number;
      tokensIn: number;
      tokensOut: number;
      costUsd: number | null;
      promptStats: string;
      raw: string;
      error: string | null;
    },
  ): Promise<void> {
    const trace: RunTrace = {
      config: { agent: CLASSIFIER_LABEL, provider, model, pr: pull.number, source: 'local' },
      stats: {
        duration_ms: r.durationMs,
        tokens_in: r.tokensIn,
        tokens_out: r.tokensOut,
        cost_usd: r.costUsd,
        findings: 0,
        grounding: 'n/a',
      },
      // Stats only — the classifier's prompt text is deliberately not stored.
      prompt_assembly: { system: CLASSIFIER_LABEL, skills: null, memory: null, specs: null, user: r.promptStats },
      tool_calls: [],
      raw_output: r.raw,
      memory_pulled: [],
      specs_read: [],
      log: log.logFor(runId),
    };
    await this.repo.completeAgentRun(runId, {
      status: r.status,
      durationMs: r.durationMs,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costUsd: r.costUsd,
      findingsCount: 0,
      grounding: 'n/a',
      error: r.error,
    });
    await this.repo.saveRunTrace(runId, trace);
    this.container.runBus.complete(runId);
  }
}
