import type { OnboardingTour } from "@devdigest/shared";

export interface IndexCounts {
  /** Files the index holds. */
  n: number;
  /** Indexed + skipped, set only when the index is partial. */
  m: number | null;
  partial: boolean;
}

/** Header counts: partial when the status is `partial` or files were skipped (AC-7). */
export function indexCounts(index: OnboardingTour["index"]): IndexCounts {
  const partial = index.status === "partial" || index.filesSkipped > 0;
  return { n: index.filesIndexed, m: partial ? index.filesIndexed + index.filesSkipped : null, partial };
}

export function elapsedSeconds(startedAt: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}
