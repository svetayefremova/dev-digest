/** Usage / stats roll-ups shared by the skills and agents modules. */

/** Stats / usage look back this many days, over completed runs only. */
export const STATS_WINDOW_DAYS = 30;

/** `agent_runs.status` of a run that finished and produced a review. */
export const COMPLETED_RUN_STATUS = 'done';

/** `part / whole` as a whole-number percentage 0–100; null when there is no whole. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
