import type { IntentConfidence, IntentSourceStatus } from "@devdigest/shared";

/* Restated locally: value imports from @devdigest/shared break the Next bundler. */
export const CONFIDENCE_COLOR: Record<IntentConfidence, string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

export const SOURCE_STATUS_MARK: Record<IntentSourceStatus, string> = {
  used: "✓",
  truncated: "✓",
  unavailable: "✕",
};
