import type { OnboardingGeneration, OnboardingReason, OnboardingTour, OnboardingTourState } from "@devdigest/shared";

export type ViewKind = "not_cloned" | "indexing" | "empty" | "skeleton" | "generated";

export interface TourView {
  kind: ViewKind;
  /** Tour (or skeleton) the sections render from; null for not_cloned / indexing / empty. */
  tour: OnboardingTour | null;
  /** First generation in progress: skeleton placeholders instead of AI-only content. */
  placeholder: boolean;
  /** A generation is running (Regenerate is aria-disabled). */
  generating: boolean;
  /** Reason shown in the banner, when the view is degraded. */
  reason: OnboardingReason | null;
  /** A regeneration failed while a previous tour is still shown. */
  failedRegeneration: boolean;
  stale: boolean;
  generation: OnboardingGeneration | null;
}

const BASE: Omit<TourView, "kind"> = {
  tour: null,
  placeholder: false,
  generating: false,
  reason: null,
  failedRegeneration: false,
  stale: false,
  generation: null,
};

/** Reasons that retry via Re-analyze (a re-index) instead of Retry (a new generation). */
const INDEX_REASONS: readonly OnboardingReason[] = ["index_failed", "no_data"];

export function isIndexReason(reason: OnboardingReason | null): boolean {
  return reason !== null && INDEX_REASONS.includes(reason);
}

/** Decide which view the tour-state maps to. Pure; every branch is a spec state. */
export function pickView(state: OnboardingTourState): TourView {
  const latest = state.latestGeneration;
  const running = latest?.status === "running";
  const failed = latest?.status === "failed";
  const base = { ...BASE, generation: latest, generating: running };

  if (!state.cloned) return { ...base, kind: "not_cloned" };
  if (state.indexing) return { ...base, kind: "indexing" };

  if (state.tour) {
    return {
      ...base,
      kind: "generated",
      tour: state.tour,
      failedRegeneration: failed,
      reason: failed ? latest.reason : null,
      stale: state.stale,
    };
  }

  const skeleton = state.skeleton;
  if (running) return { ...base, kind: "skeleton", tour: skeleton, placeholder: true };
  if (!state.repoIntelEnabled) {
    return { ...base, kind: "skeleton", tour: skeleton, reason: "flag_off" };
  }
  if (failed) {
    return { ...base, kind: "skeleton", tour: skeleton, reason: latest.reason ?? skeleton?.reason ?? null };
  }
  const reason = skeleton?.reason ?? null;
  if (skeleton && reason !== null && reason !== "no_data") {
    return { ...base, kind: "skeleton", tour: skeleton, reason };
  }
  return { ...base, kind: "empty" };
}

/** Poll while the index is being built or a generation is running. */
export function shouldPoll(state: OnboardingTourState | undefined): boolean {
  return !!state && (state.indexing || state.latestGeneration?.status === "running");
}

export interface GenerateErrorInfo {
  key: "cooldown" | "indexingInProgress" | "repoIntelDisabled" | "notCloned" | "generic";
  seconds?: number;
}

/** Map a failed generate request (ApiError-shaped) to a copy key. */
export function generateErrorInfo(err: unknown): GenerateErrorInfo {
  const e = err as { status?: number; code?: string; details?: unknown } | null;
  if (e?.status === 429) {
    const seconds = (e.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    return { key: "cooldown", seconds: typeof seconds === "number" ? Math.ceil(seconds) : undefined };
  }
  if (e?.status === 409 && e.code === "indexing_in_progress") return { key: "indexingInProgress" };
  if (e?.status === 409 && e.code === "repo_intel_disabled") return { key: "repoIntelDisabled" };
  if (e?.status === 422) return { key: "notCloned" };
  return { key: "generic" };
}
