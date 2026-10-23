import { and, desc, eq, lt } from 'drizzle-orm';
import type { OnboardingGeneration, OnboardingReason, OnboardingTour } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type GenerationRow = typeof t.onboardingGenerations.$inferSelect;
type Phase = 'indexing' | 'generating';

export interface FinishValues {
  status: 'succeeded' | 'failed';
  reason?: OnboardingReason | null;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  durationMs?: number | null;
}

export function toGenerationDto(row: GenerationRow): OnboardingGeneration {
  return {
    id: row.id,
    status: row.status,
    phase: row.phase,
    reason: (row.reason as OnboardingReason | null) ?? null,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

/** Data access for the persisted tour (`onboarding`) and its generation records. */
export class OnboardingRepository {
  constructor(private db: Db) {}

  /** Raw persisted JSON (any shape: validated by the caller). */
  async getTourJson(repoId: string): Promise<unknown | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    return row?.json ?? null;
  }

  async upsertTour(repoId: string, tour: OnboardingTour): Promise<void> {
    const now = new Date();
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json: tour, generatedAt: now })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json: tour, generatedAt: now } });
  }

  /** New `running` row, or null when the repo already has one (partial unique index). */
  async insertRunning(workspaceId: string, repoId: string, phase: Phase): Promise<GenerationRow | null> {
    const [row] = await this.db
      .insert(t.onboardingGenerations)
      .values({ workspaceId, repoId, phase, status: 'running' })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async getById(id: string): Promise<GenerationRow | null> {
    const [row] = await this.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.id, id));
    return row ?? null;
  }

  async getRunning(repoId: string): Promise<GenerationRow | null> {
    const [row] = await this.db
      .select()
      .from(t.onboardingGenerations)
      .where(and(eq(t.onboardingGenerations.repoId, repoId), eq(t.onboardingGenerations.status, 'running')));
    return row ?? null;
  }

  async getLatest(repoId: string): Promise<GenerationRow | null> {
    const [row] = await this.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId))
      .orderBy(desc(t.onboardingGenerations.startedAt))
      .limit(1);
    return row ?? null;
  }

  async setPhase(id: string, phase: Phase): Promise<void> {
    await this.db
      .update(t.onboardingGenerations)
      .set({ phase })
      .where(eq(t.onboardingGenerations.id, id));
  }

  async finish(id: string, values: FinishValues): Promise<void> {
    await this.db
      .update(t.onboardingGenerations)
      .set({
        status: values.status,
        reason: values.reason ?? null,
        model: values.model ?? null,
        tokensIn: values.tokensIn ?? null,
        tokensOut: values.tokensOut ?? null,
        durationMs: values.durationMs ?? null,
        finishedAt: new Date(),
      })
      .where(and(eq(t.onboardingGenerations.id, id), eq(t.onboardingGenerations.status, 'running')));
  }

  /** Fail `running` rows started before `olderThan` as `interrupted`, optionally for one repo. */
  async failStaleRunning(olderThan: Date, repoId?: string): Promise<void> {
    const conds = [
      eq(t.onboardingGenerations.status, 'running'),
      lt(t.onboardingGenerations.startedAt, olderThan),
    ];
    if (repoId) conds.push(eq(t.onboardingGenerations.repoId, repoId));
    await this.db
      .update(t.onboardingGenerations)
      .set({ status: 'failed', reason: 'interrupted', finishedAt: new Date() })
      .where(and(...conds));
  }
}
