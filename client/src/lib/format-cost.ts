/**
 * Shared USD cost formatter for the Run Cost Badge (PR list column, Timeline
 * rows, Review Runs cards, trace drawer sidebar). `null`/`undefined` means no
 * cost data (e.g. a provider without pricing, or a run that hasn't completed)
 * and renders as "–", never "$0.00".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "–";
  if (usd === 0) return "$0.00";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
