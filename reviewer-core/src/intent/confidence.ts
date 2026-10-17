import type { IntentConfidence } from '@devdigest/shared';

export interface ConfidenceInput {
  /** Description has at least a sentence of real content (not empty/trivial). */
  hasMeaningfulBody: boolean;
  /** Count of linked issue / plan / spec sources that were actually used. */
  usedDocs: number;
  /** Count of referenced sources that could not be retrieved. */
  unavailable: number;
}

/**
 * Deterministic confidence (never model-reported):
 * high = meaningful body + ≥1 issue/plan/spec used + nothing unavailable;
 * medium = meaningful body but no docs, or some sources unavailable;
 * low = empty/trivial body.
 */
export function computeConfidence(i: ConfidenceInput): IntentConfidence {
  if (!i.hasMeaningfulBody) return 'low';
  if (i.usedDocs >= 1 && i.unavailable === 0) return 'high';
  return 'medium';
}

/** A body counts as meaningful when it has a sentence-sized amount of text. */
export function isMeaningfulBody(body: string): boolean {
  const text = body.trim();
  return text.length >= 20 && text.split(/\s+/).length >= 4;
}
