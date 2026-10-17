import type { Finding } from '@devdigest/shared';
import { SEV_RANK } from '../output/to-review.js';
import type { ReviewIntentContext } from '../intent/types.js';

export interface IntentScopeResult {
  findings: Finding[];
  /** How many out-of-scope findings were dropped. */
  filtered: number;
  /** True when exactly one out-of-scope finding was kept as a real-defect signal. */
  keptSignal: boolean;
}

/** Real defects worth surfacing even when outside the PR's stated scope. */
function isSignal(f: Finding): boolean {
  if (f.severity === 'CRITICAL') return true;
  return f.severity === 'WARNING' && (f.category === 'security' || f.category === 'bug');
}

const rank = (f: Finding): number => SEV_RANK[f.severity] ?? 0;

/**
 * Filter findings flagged `out_of_scope` by the model. No intent → passthrough.
 * `low` confidence → keep everything (flag stays as a marker). Otherwise keep
 * in-scope findings plus exactly ONE out-of-scope signal (highest-severity
 * CRITICAL, else highest WARNING in security/bug), and drop the rest.
 */
export function applyIntentScope(
  findings: Finding[],
  intent?: Pick<ReviewIntentContext, 'confidence'>,
): IntentScopeResult {
  if (!intent || intent.confidence === 'low') {
    return { findings, filtered: 0, keptSignal: false };
  }
  const outOfScope = findings.filter((f) => f.out_of_scope === true);
  if (outOfScope.length === 0) return { findings, filtered: 0, keptSignal: false };

  const signal = outOfScope
    .filter(isSignal)
    .sort((a, b) => rank(b) - rank(a) || b.confidence - a.confidence)[0];
  const kept = findings.filter((f) => f.out_of_scope !== true || f === signal);
  return {
    findings: kept,
    filtered: findings.length - kept.length,
    keptSignal: signal !== undefined,
  };
}
