/**
 * Inputs to the PR intent classifier. Every field is metadata or author/issue/
 * doc text — there is deliberately NO field that accepts diff hunks or lines,
 * so diff bodies cannot reach the classifier by construction.
 */

export interface IntentFileSummary {
  path: string;
  additions: number;
  deletions: number;
  /** `@@ -a,b +c,d @@` headers only (no section headings, no hunk lines). */
  hunkHeaders: string[];
}

export interface IntentDoc {
  kind: 'linked_issue' | 'plan' | 'spec';
  /** Log-safe reference (e.g. `owner/repo#12`, `docs/plans/x.md@main`). */
  ref: string;
  text: string;
}

export interface IntentInput {
  title: string;
  body: string;
  issue?: IntentDoc;
  docs: IntentDoc[];
  files: IntentFileSummary[];
  /** Log-safe refs of referenced context that could not be retrieved. */
  missing: { kind: IntentDoc['kind']; ref: string }[];
}

/** Size accounting of what went into the classifier prompt (no content). */
export interface PromptStats {
  title: number;
  description: number;
  issue: number;
  docs: { ref: string; chars: number }[];
  files: number;
  hunk_headers: number;
  est_tokens_in: number;
}

/** The classified intent as injected into a review prompt. */
export interface ReviewIntentContext {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
  confidence: 'high' | 'medium' | 'low';
  /** Log-safe notes about referenced context that could not be retrieved. */
  missing_context: string[];
  /** True when the intent was derived from an earlier head commit. */
  stale: boolean;
}
