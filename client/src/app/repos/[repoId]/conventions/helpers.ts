import type { ConventionCandidate } from "@devdigest/shared";

/** `path:line` or `path:start-end`, as shown above a candidate's snippet. */
export function evidenceRef(c: Pick<ConventionCandidate, "evidence_path" | "evidence_line" | "evidence_end_line">): string {
  const lines = c.evidence_end_line > c.evidence_line ? `${c.evidence_line}-${c.evidence_end_line}` : c.evidence_line;
  return `${c.evidence_path}:${lines}`;
}

/** Confidence 0..1 → whole percent. */
export const confidencePct = (confidence: number) => Math.round(confidence * 100);
