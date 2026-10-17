import type { Severity } from "@devdigest/shared";

/* Restated locally: value imports from @devdigest/shared break the Next bundler. */
export const FOCUS_SEVERITY_RANK: Partial<Record<Severity, number>> = {
  CRITICAL: 0,
  WARNING: 1,
};

/** Most entries shown in the "read these first" list. */
export const MAX_FOCUS_ITEMS = 6;
