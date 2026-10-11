import type { ConventionCategory } from "@devdigest/shared";

/* Restated locally: only TYPES can be imported from the vendored shared
   package in the client (a value import breaks the Next bundle). */
export const CONVENTION_CATEGORIES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "errors",
  "testing",
  "imports",
  "typing",
  "api",
  "general",
];

/** Confidence (0-100) from which the bar reads as strong (green) rather than amber. */
export const STRONG_CONFIDENCE_PCT = 80;

export const SKELETON_CARDS = 3;
